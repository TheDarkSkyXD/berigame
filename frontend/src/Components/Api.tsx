import React, { useEffect } from "react";
import {
  useChatStore,
  useOtherUsersStore,
  useUserStateStore,
  useWebsocketStore,
} from "../store";

const Api = (props) => {
  let url = "https://3qzrz2p4f0.execute-api.ap-southeast-2.amazonaws.com/dev/";
  let wsUrl = "wss://r5ou09euoa.execute-api.ap-southeast-2.amazonaws.com/dev";
  const setWebSocket = useWebsocketStore((state: any) => state.setWebSocket);
  const websocketConnection = useWebsocketStore(
    (state: any) => state.websocketConnection
  );
  const setAllConnections = useWebsocketStore(
    (state: any) => state.setAllConnections
  );
  const allConnections = useWebsocketStore(
    (state: any) => state.allConnections
  );
  const addChatMessage = useChatStore((state: any) => state.addChatMessage);
  const setUserPosition = useOtherUsersStore(
    (state: any) => state.setUserPosition
  );
  const addDamageToRender = useOtherUsersStore(
    (state: any) => state.addDamageToRender
  );
  const setUserConnectionId = useUserStateStore(
    (state: any) => state.setUserConnectionId
  );

  if (process.env.NODE_ENV === "development") {
    url = "http://localhost:3000/dev/";
    wsUrl = "ws://localhost:3001";
  }
  let clientConnectionId = null;

  useEffect(() => {
    if (websocketConnection)
      websocketConnection.onmessage = _webSocketMessageReceived;
  }, [allConnections]);

  const updateUserPosition = (newData: any) => {
    newData.selfDestroyTime = new Date().getTime() + 5000;
    setUserPosition(newData);
    if (allConnections && allConnections.indexOf(newData.connectionId) === -1) {
      setAllConnections([...allConnections, newData.connectionId]);
    }
  };

  const updateConnections = (connections: any) => {
    const tempAllConnections = [];
    for (const item of connections) {
      tempAllConnections.push(item.SK.split("#")[1]);
    }
    setAllConnections(tempAllConnections);
  };

  const _webSocketMessageReceived = (e) => {
    if (e.data) {
      const messageObject = JSON.parse(e.data);
      if (messageObject.chatMessage) {
        addChatMessage(messageObject);
      }
      if (messageObject.position && messageObject.userId) {
        updateUserPosition(messageObject);
        if(messageObject.attackingPlayer)
          addDamageToRender(messageObject.damageGiven);
      }
      if (messageObject.connections) {
        updateConnections(messageObject.connections);
        console.log("MY CID: ", messageObject.yourConnectionId);
        setUserConnectionId(messageObject.yourConnectionId);
      }
    }
  };

  const _webSocketError = (e: Event) => {
    console.error("Websocket error:", e);
  };

  const _webSocketClose = (e: Event) => {
    console.log("Websocket close:", e);
  };

  //Initialize Websocket
  useEffect(() => {
    const webSocketConnection = new WebSocket(wsUrl);
    webSocketConnection.onerror = _webSocketError;
    webSocketConnection.onclose = _webSocketClose;
    webSocketConnection.onmessage = _webSocketMessageReceived;
    setWebSocket(webSocketConnection);
  }, []);

  return <div> </div>;
};

export default Api;
