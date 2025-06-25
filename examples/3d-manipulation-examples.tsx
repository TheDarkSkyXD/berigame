import React, { useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PivotControls, TransformControls, Grid } from '@react-three/drei';
import * as THREE from 'three';

// Example 1: PivotControls - Modern approach with HTML annotations
const PivotControlsExample = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      {/* UI Controls */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 100 }}>
        <button onClick={() => setTransformMode('translate')}>Translate</button>
        <button onClick={() => setTransformMode('rotate')}>Rotate</button>
        <button onClick={() => setTransformMode('scale')}>Scale</button>
      </div>

      <Canvas camera={{ position: [5, 5, 5] }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />
        
        {/* Grid for reference */}
        <Grid args={[20, 20]} />
        
        {/* Object with PivotControls */}
        <PivotControls
          // Enable/disable different transform modes
          disableAxes={transformMode !== 'translate'}
          disableRotations={transformMode !== 'rotate'}
          disableScaling={transformMode !== 'scale'}
          
          // Visual customization
          scale={1}
          lineWidth={3}
          axisColors={['#ff0000', '#00ff00', '#0000ff']} // RGB for XYZ
          hoveredColor="#ffff00"
          
          // HTML annotations show values while dragging
          annotations={true}
          annotationsClass="transform-annotation"
          
          // Event handlers
          onDragStart={() => console.log('Drag started')}
          onDrag={(localMatrix, deltaLocal, worldMatrix, deltaWorld) => {
            console.log('Dragging:', { localMatrix, worldMatrix });
          }}
          onDragEnd={() => console.log('Drag ended')}
          
          // Auto-apply transforms to children
          autoTransform={true}
        >
          <mesh ref={meshRef}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="orange" />
          </mesh>
        </PivotControls>

        {/* Camera controls - automatically disabled during transform */}
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
};

// Example 2: TransformControls - Traditional Three.js approach
const TransformControlsExample = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [mode, setMode] = useState<'translate' | 'rotate' | 'scale'>('translate');

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      {/* UI Controls */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 100 }}>
        <button onClick={() => setMode('translate')}>Translate</button>
        <button onClick={() => setMode('rotate')}>Rotate</button>
        <button onClick={() => setMode('scale')}>Scale</button>
      </div>

      <Canvas camera={{ position: [5, 5, 5] }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />
        
        <Grid args={[20, 20]} />
        
        {/* TransformControls wrapping the object */}
        <TransformControls 
          object={meshRef} 
          mode={mode}
          onObjectChange={(e) => {
            console.log('Object transformed:', e);
          }}
        />
        
        <mesh ref={meshRef}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="lightblue" />
        </mesh>

        {/* Camera controls - automatically disabled during transform */}
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
};

// Example 3: Advanced PivotControls with controlled transforms
const AdvancedPivotControlsExample = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [matrix, setMatrix] = useState(new THREE.Matrix4());
  const [position, setPosition] = useState([0, 0, 0]);
  const [rotation, setRotation] = useState([0, 0, 0]);
  const [scale, setScale] = useState([1, 1, 1]);

  const handleTransform = (
    localMatrix: THREE.Matrix4,
    deltaLocal: THREE.Matrix4,
    worldMatrix: THREE.Matrix4,
    deltaWorld: THREE.Matrix4
  ) => {
    // Extract position, rotation, scale from matrix
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    worldMatrix.decompose(pos, quat, scl);
    
    const euler = new THREE.Euler().setFromQuaternion(quat);
    
    setPosition([pos.x, pos.y, pos.z]);
    setRotation([euler.x, euler.y, euler.z]);
    setScale([scl.x, scl.y, scl.z]);
    setMatrix(worldMatrix.clone());
  };

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      {/* Transform values display */}
      <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 100, background: 'rgba(0,0,0,0.8)', color: 'white', padding: '10px' }}>
        <div>Position: {position.map(v => v.toFixed(2)).join(', ')}</div>
        <div>Rotation: {rotation.map(v => (v * 180 / Math.PI).toFixed(1)).join(', ')}°</div>
        <div>Scale: {scale.map(v => v.toFixed(2)).join(', ')}</div>
      </div>

      <Canvas camera={{ position: [5, 5, 5] }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />
        
        <Grid args={[20, 20]} />
        
        {/* Controlled PivotControls */}
        <PivotControls
          matrix={matrix}
          autoTransform={false} // We handle transforms manually
          onDrag={handleTransform}
          annotations={true}
          scale={1.2}
          lineWidth={4}
          
          // Anchor to different pivot points
          anchor={[0, 0, 0]} // Center pivot
          // anchor={[0, -1, 0]} // Bottom pivot
          // anchor={[-1, -1, -1]} // Corner pivot
        >
          <mesh 
            ref={meshRef}
            position={position as [number, number, number]}
            rotation={rotation as [number, number, number]}
            scale={scale as [number, number, number]}
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="purple" />
          </mesh>
        </PivotControls>

        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
};

// Example 4: Multiple objects with individual controls
const MultiObjectExample = () => {
  const [selectedObject, setSelectedObject] = useState<number | null>(null);
  const objects = [
    { id: 1, position: [-2, 0, 0], color: 'red' },
    { id: 2, position: [0, 0, 0], color: 'green' },
    { id: 3, position: [2, 0, 0], color: 'blue' },
  ];

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 100 }}>
        <div>Selected: {selectedObject || 'None'}</div>
        <button onClick={() => setSelectedObject(null)}>Deselect</button>
      </div>

      <Canvas camera={{ position: [5, 5, 5] }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />
        
        <Grid args={[20, 20]} />
        
        {objects.map((obj) => (
          <group key={obj.id}>
            {/* Only show controls for selected object */}
            {selectedObject === obj.id && (
              <PivotControls
                annotations={true}
                onDragStart={() => console.log(`Started dragging object ${obj.id}`)}
                onDragEnd={() => console.log(`Finished dragging object ${obj.id}`)}
              >
                <mesh 
                  position={obj.position as [number, number, number]}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedObject(obj.id);
                  }}
                >
                  <boxGeometry args={[0.8, 0.8, 0.8]} />
                  <meshStandardMaterial color={obj.color} />
                </mesh>
              </PivotControls>
            )}
            
            {/* Show object without controls if not selected */}
            {selectedObject !== obj.id && (
              <mesh 
                position={obj.position as [number, number, number]}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedObject(obj.id);
                }}
              >
                <boxGeometry args={[0.8, 0.8, 0.8]} />
                <meshStandardMaterial color={obj.color} opacity={0.7} transparent />
              </mesh>
            )}
          </group>
        ))}

        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
};

export {
  PivotControlsExample,
  TransformControlsExample,
  AdvancedPivotControlsExample,
  MultiObjectExample
};
