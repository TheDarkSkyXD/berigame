import React, { Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, useGLTF, PivotControls, TransformControls } from '@react-three/drei';
import { useWorldBuilderStore } from '../store/worldBuilderStore';
import { WorldObject } from '../types/WorldTypes';
import * as THREE from 'three';

const WorldBuilderCanvas: React.FC = () => {
  const { 
    currentWorld, 
    showGrid, 
    isPreviewMode,
    selectedObjectId,
    selectObject,
    addObject 
  } = useWorldBuilderStore();

  const handleCanvasClick = (event: any) => {
    if (isPreviewMode) return;
    
    // If clicking on empty space, deselect
    if (event.object.name === 'ground-plane') {
      selectObject(null);
    }
  };

  const handleGroundClick = (event: any) => {
    if (isPreviewMode) return;
    
    event.stopPropagation();
    const point = event.point;
    selectObject(null);
  };

  return (
    <Canvas
      camera={{ position: [10, 10, 10], fov: 60 }}
      style={{ background: 'linear-gradient(to bottom, #87CEEB 0%, #98FB98 100%)' }}
      onClick={handleCanvasClick}
    >
      <Suspense fallback={null}>
        {/* Lighting */}
        <ambientLight intensity={0.4} />
        <pointLight position={[10, 30, 0]} intensity={0.5} />
        <hemisphereLight intensity={0.3} />

        {/* Controls */}
        <OrbitControls
          makeDefault
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          target={[0, 0, 0]}
        />

        {/* Grid */}
        {showGrid && !isPreviewMode && (
          <Grid 
            args={[50, 50]} 
            position={[0, 0.01, 0]}
            cellSize={1}
            cellThickness={0.5}
            cellColor="#666"
            sectionSize={5}
            sectionThickness={1}
            sectionColor="#888"
          />
        )}

        {/* Ground plane for clicking */}
        <mesh
          name="ground-plane"
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0, 0]}
          onClick={handleGroundClick}
          visible={false}
        >
          <planeGeometry args={[100, 100]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>

        {/* World objects */}
        {currentWorld?.objects.map(obj => (
          <EnhancedWorldObjectRenderer
            key={obj.id}
            object={obj}
            isSelected={selectedObjectId === obj.id}
            isPreviewMode={isPreviewMode}
          />
        ))}
      </Suspense>
    </Canvas>
  );
};

interface EnhancedWorldObjectRendererProps {
  object: WorldObject;
  isSelected: boolean;
  isPreviewMode: boolean;
}

const EnhancedWorldObjectRenderer: React.FC<EnhancedWorldObjectRendererProps> = ({
  object,
  isSelected,
  isPreviewMode
}) => {
  const { selectObject, updateObject, transformMode, gizmoType } = useWorldBuilderStore();
  const meshRef = useRef<THREE.Group>(null);

  const handleClick = (event: any) => {
    if (isPreviewMode) return;

    event.stopPropagation();
    selectObject(object.id);
  };

  const handlePivotTransform = (
    localMatrix: THREE.Matrix4,
    deltaLocal: THREE.Matrix4,
    worldMatrix: THREE.Matrix4,
    deltaWorld: THREE.Matrix4
  ) => {
    // Extract position, rotation, scale from world matrix
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    worldMatrix.decompose(pos, quat, scl);

    const euler = new THREE.Euler().setFromQuaternion(quat);

    updateObject(object.id, {
      position: { x: pos.x, y: pos.y, z: pos.z },
      rotation: { x: euler.x, y: euler.y, z: euler.z },
      scale: { x: scl.x, y: scl.y, z: scl.z }
    });
  };

  const handleTransformChange = () => {
    if (meshRef.current) {
      const pos = meshRef.current.position;
      const rot = meshRef.current.rotation;
      const scl = meshRef.current.scale;

      updateObject(object.id, {
        position: { x: pos.x, y: pos.y, z: pos.z },
        rotation: { x: rot.x, y: rot.y, z: rot.z },
        scale: { x: scl.x, y: scl.y, z: scl.z }
      });
    }
  };

  const renderObjectMesh = () => (
    <group
      ref={meshRef}
      position={[object.position.x, object.position.y, object.position.z]}
      rotation={[object.rotation.x, object.rotation.y, object.rotation.z]}
      scale={[object.scale.x, object.scale.y, object.scale.z]}
      onClick={handleClick}
    >
      {/* Selection indicator */}
      {isSelected && !isPreviewMode && (
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[2, 0.1, 2]} />
          <meshBasicMaterial color="#4CAF50" transparent opacity={0.3} />
        </mesh>
      )}

      {/* Render the actual object */}
      <ObjectMesh object={object} />
    </group>
  );

  // Show gizmo controls only for selected object
  if (isSelected && !isPreviewMode) {
    if (gizmoType === 'pivot') {
      return (
        <PivotControls
          // Configure based on transform mode
          disableAxes={transformMode !== 'translate'}
          disableRotations={transformMode !== 'rotate'}
          disableScaling={transformMode !== 'scale'}

          // Visual settings
          scale={1.2}
          lineWidth={3}
          axisColors={['#ff4444', '#44ff44', '#4444ff']} // Red, Green, Blue for X, Y, Z
          hoveredColor="#ffff44"

          // Features
          annotations={true}
          annotationsClass="world-builder-annotation"

          // Events
          onDragStart={() => console.log(`Started transforming ${object.id}`)}
          onDrag={handlePivotTransform}
          onDragEnd={() => console.log(`Finished transforming ${object.id}`)}

          // Auto-apply transforms
          autoTransform={false} // We handle manually for better control
        >
          {renderObjectMesh()}
        </PivotControls>
      );
    } else {
      return (
        <>
          <TransformControls
            object={meshRef}
            mode={transformMode}
            onObjectChange={handleTransformChange}
          />
          {renderObjectMesh()}
        </>
      );
    }
  }

  return renderObjectMesh();
};

const ObjectMesh: React.FC<{ object: WorldObject }> = ({ object }) => {
  switch (object.type) {
    case 'tree-simple':
      return <TreeModel modelPath="/tree-simple.glb" />;
    case 'tree-evergreen':
      return <TreeModel modelPath="/tree-evergreen.glb" />;
    case 'tree-berry':
      return <TreeModel modelPath="/tree.glb" />;
    case 'ground-plane':
      return <GroundPlane />;
    case 'water-plane':
      return <WaterPlane />;
    default:
      return <DefaultObject />;
  }
};

const TreeModel: React.FC<{ modelPath: string }> = ({ modelPath }) => {
  try {
    const { scene } = useGLTF(modelPath);
    const clonedScene = scene.clone();
    return <primitive object={clonedScene} />;
  } catch (error) {
    console.warn(`Failed to load model: ${modelPath}`, error);
    return <DefaultObject />;
  }
};

const GroundPlane: React.FC = () => {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[50, 50]} />
      <meshLambertMaterial color="#fff1a1" side={THREE.DoubleSide} />
    </mesh>
  );
};

const WaterPlane: React.FC = () => {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
      <planeGeometry args={[500, 500]} />
      <meshLambertMaterial color="#006994" side={THREE.DoubleSide} transparent opacity={0.8} />
    </mesh>
  );
};

const DefaultObject: React.FC = () => {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshLambertMaterial color="#ff6b6b" />
    </mesh>
  );
};

export default WorldBuilderCanvas;
