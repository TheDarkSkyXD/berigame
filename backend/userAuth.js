"use strict";
const uuid = require("uuid");
const AWS = require("aws-sdk"); // eslint-disable-line import/no-extraneous-dependencies
const dynamoDb = new AWS.DynamoDB.DocumentClient();

// DynamoDB timing utility
const logDynamoDBCall = (operation, params) => {
  const startTime = Date.now();
  const operationId = `${operation}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  console.log(`🔵 [${operationId}] Starting DynamoDB ${operation}`, {
    operation,
    table: params.TableName,
    key: params.Key || 'N/A',
    timestamp: new Date().toISOString()
  });

  return {
    operationId,
    startTime,
    finish: () => {
      const duration = Date.now() - startTime;
      console.log(`🟢 [${operationId}] Completed DynamoDB ${operation} in ${duration}ms`, {
        operation,
        duration,
        timestamp: new Date().toISOString()
      });

      if (duration > 500) {
        console.warn(`🐌 [${operationId}] Slow DynamoDB operation: ${operation} took ${duration}ms`);
      }

      return duration;
    }
  };
};
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const helpers = require("./helpers");

module.exports.signup = async (event, context, callback) => {
  if (typeof event === "string") event = JSON.parse(event);
  const data = JSON.parse(event.body);

  const checkEmailParams = {
    TableName: process.env.DB,
    IndexName: "EmailIndex",
    KeyConditionExpression: "email = :em",
    ExpressionAttributeValues: { ":em": data.email.toLowerCase() },
  };
  const checkHandleParams = {
    TableName: process.env.DB,
    IndexName: "HandleIndex",
    KeyConditionExpression: "handle = :ha",
    ExpressionAttributeValues: { ":ha": data.handle.toLowerCase() },
  };
  try {
    let emailCheck = await dynamoDb.query(checkEmailParams).promise();
    if (emailCheck.Count > 0) {
      callback(null, helpers.invalidCallbackObject("Email is not unique"));
      return;
    }

    let handleCheck = await dynamoDb.query(checkHandleParams).promise();
    if (handleCheck.Count > 0) {
      callback(null, helpers.invalidCallbackObject("Handle is not unique"));
      return;
    }

    const timestamp = new Date().getTime();
    const PK = "USER#" + uuid.v1();
    const SK = "CREATED#" + timestamp;
    const email = data.email.toLowerCase();
    const handle = data.handle.toLowerCase();
    const hash = await bcrypt.hashSync(data.password, 10);
    const params = {
      TableName: process.env.DB,
      Item: {
        PK,
        SK,
        handle,
        email,
        password: hash,
        deviceId: data.deviceId,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    };

    // write the user to the database
    const signupTimer = logDynamoDBCall('put', params);
    await dynamoDb.put(params).promise();
    signupTimer.finish();
    callback(
      null,
      helpers.validCallbackObject({
        token: jwt.sign({ PK, email }, process.env.JWT_SECRET),
      })
    );
  } catch (e) {
    console.error(e);
  }
};

module.exports.login = async (event, context, callback) => {
  if (typeof event === "string") event = JSON.parse(event);
  const inputData = JSON.parse(event.body);

  const checkParams = {
    TableName: process.env.DB,
    IndexName: "EmailIndex",
    KeyConditionExpression: "email = :em",
    ExpressionAttributeValues: { ":em": inputData.email.toLowerCase() },
  };
  try {
    let res = await dynamoDb.query(checkParams).promise();
    if (res.Count === 0) {
      callback(null, helpers.invalidCallbackObject("Invalid login details"));
      return;
    } else {
      const ddbUser = res.Items[0];
      let correctPassword = await bcrypt.compareSync(
        inputData.password,
        ddbUser.password
      );
      if (correctPassword) {
        callback(
          null,
          helpers.validCallbackObject({
            token: jwt.sign({ PK: ddbUser.PK }, process.env.JWT_SECRET),
          })
        );
      } else {
        callback(null, helpers.invalidCallbackObject("Invalid login details"));
      }
    }
  } catch (e) {
    console.error(e);
  }
};

module.exports.auth = (event, context, callback) => {
  const decoded = jwt.decode(
    event.headers.Authorization,
    process.env.JWT_SECRET
  );
  const checkParams = {
    TableName: process.env.DB,
    KeyConditionExpression: "PK = :pk",
    ExpressionAttributeValues: { ":pk": decoded.PK },
  };
  const authTimer = logDynamoDBCall('query', checkParams);
  dynamoDb.query(checkParams, function (err, ddbData) {
    authTimer.finish();
    if (err) {
      console.error("Unable to query. Error:", JSON.stringify(err, null, 2));
    } else {
      if (ddbData.Count === 0) {
        callback(null, helpers.invalidCallbackObject("Invalid login details"));
        return;
      }
      const ddbUser = ddbData.Items[0];
      callback(
        null,
        helpers.validCallbackObject({
          token: jwt.sign({ PK: ddbUser.PK }, process.env.JWT_SECRET),
        })
      );
    }
  });
};
