import { Html } from "@react-three/drei";
import React from "react";
import { Vector3 } from "three";

const DamageNumber = (props) => {
  const position = new Vector3(
    props.playerPosition.x,
    props.playerPosition.y + props.yOffset,
    props.playerPosition.z
  );
  const randBool = Math.random() < 0.5;
  const isZeroDamage = props.damageToRender === 0;
  const className = "damage-number" +
    (isZeroDamage ? " zero-damage" : "") +
    (randBool ? " animation1" : " animation2");

  return (
    <Html
      zIndexRange={[6, 4]}
      prepend
      center
      position={position}
      className={className}
    >
      {props.damageToRender}
    </Html>
  );
};

export default DamageNumber;
