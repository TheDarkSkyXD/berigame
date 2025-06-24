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

  // Determine damage type and styling
  const damageValue = props.damageToRender;
  const isBlocked = damageValue === 'BLOCKED';
  const isZeroDamage = damageValue === 0;
  const isNormalDamage = typeof damageValue === 'number' && damageValue > 0;

  // Build CSS classes based on damage type
  let className = "damage-number";
  if (isBlocked) {
    className += " blocked-attack";
  } else if (isZeroDamage) {
    className += " zero-damage";
  } else if (isNormalDamage) {
    className += " normal-damage";
  }
  className += (randBool ? " animation1" : " animation2");

  // Determine display text
  let displayText = damageValue;
  if (isBlocked) {
    displayText = "BLOCKED";
  }

  console.log(`💥 Rendering damage number: ${damageValue} (type: ${isBlocked ? 'blocked' : isZeroDamage ? 'zero' : 'normal'} damage)`);

  return (
    <Html
      zIndexRange={[6, 4]}
      prepend
      center
      position={position}
      className={className}
    >
      {displayText}
    </Html>
  );
};

export default DamageNumber;
