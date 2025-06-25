import React, { Suspense, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, useGLTF, PivotControls, TransformControls } from '@react-three/drei';
import * as THREE from 'three';

// Enhanced World Builder Store (example of what you'd add to your existing store)
interface WorldBuilderState {
  currentWorld: any;
  selectedObjectId: string | null;
  transformMode: 'translate' | 'rotate' | 'scale';
  gizmoType: 'pivot' | 'transform';
  showGrid: boolean;
  isPreviewMode: boolean;
  selectObject: (id: string | null) => void;
  updateObject: (id: string, updates: any) => void;
  setTransformMode: (mode: 'translate' | 'rotate' | 'scale') => void;
  setGizmoType: (type: 'pivot' | 'transform') => void;
}

// Mock store for this example
const useWorldBuilderStore = (): WorldBuilderState => {
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [gizmoType, setGizmoType] = useState<'pivot' | 'transform'>('pivot');
  
  return {
    currentWorld: {
      objects: [
        { id: '1', type: 'tree-simple', position: { x: -2, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
        { id: '2', type: 'tree-berry', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
        { id: '3', type: 'tree-evergreen', position: { x: 2, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
      ]
    },
    selectedObjectId,
    transformMode,
    gizmoType,
    showGrid: true,
    isPreviewMode: false,
    selectObject: setSelectedObjectId,
    updateObject: (id, updates) => console.log('Update object:', id, updates),
    setTransformMode,
    setGizmoType,
  };
};

// Enhanced World Builder Canvas with Gizmos
const EnhancedWorldBuilderCanvas: React.FC = () => {
  const { 
    currentWorld, 
    showGrid, 
    isPreviewMode,
    selectedObjectId,
    transformMode,
    gizmoType,
    selectObject,
    setTransformMode,
    setGizmoType,
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
    selectObject(null);
  };

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      {/* Enhanced UI Controls */}
      <div style={{ 
        position: 'absolute', 
        top: 10, 
        left: 10, 
        zIndex: 100, 
        background: 'rgba(0,0,0,0.8)', 
        color: 'white', 
        padding: '15px',
        borderRadius: '8px'
      }}>
        <h3>Transform Controls</h3>
        
        {/* Gizmo Type Selection */}
        <div style={{ marginBottom: '10px' }}>
          <label>Gizmo Type: </label>
          <select value={gizmoType} onChange={(e) => setGizmoType(e.target.value as 'pivot' | 'transform')}>
            <option value="pivot">PivotControls (Modern)</option>
            <option value="transform">TransformControls (Classic)</option>
          </select>
        </div>
        
        {/* Transform Mode Selection */}
        <div style={{ marginBottom: '10px' }}>
          <label>Mode: </label>
          <button 
            onClick={() => setTransformMode('translate')}
            style={{ 
              backgroundColor: transformMode === 'translate' ? '#4CAF50' : '#666',
              color: 'white',
              border: 'none',
              padding: '5px 10px',
              margin: '2px',
              borderRadius: '4px'
            }}
          >
            Translate
          </button>
          <button 
            onClick={() => setTransformMode('rotate')}
            style={{ 
              backgroundColor: transformMode === 'rotate' ? '#4CAF50' : '#666',
              color: 'white',
              border: 'none',
              padding: '5px 10px',
              margin: '2px',
              borderRadius: '4px'
            }}
          >
            Rotate
          </button>
          <button 
            onClick={() => setTransformMode('scale')}
            style={{ 
              backgroundColor: transformMode === 'scale' ? '#4CAF50' : '#666',
              color: 'white',
              border: 'none',
              padding: '5px 10px',
              margin: '2px',
              borderRadius: '4px'
            }}
          >
            Scale
          </button>
        </div>
        
        <div>Selected: {selectedObjectId || 'None'}</div>
        <button 
          onClick={() => selectObject(null)}
          style={{ 
            backgroundColor: '#f44336',
            color: 'white',
            border: 'none',
            padding: '5px 10px',
            borderRadius: '4px',
            marginTop: '5px'
          }}
        >
          Deselect
        </button>
      </div>

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

          {/* World objects with enhanced controls */}
          {currentWorld?.objects.map(obj => (
            <EnhancedWorldObjectRenderer 
              key={obj.id} 
              object={obj}
              isSelected={selectedObjectId === obj.id}
              isPreviewMode={isPreviewMode}
              transformMode={transformMode}
              gizmoType={gizmoType}
            />
          ))}
        </Suspense>
      </Canvas>
    </div>
  );
};

// Enhanced Object Renderer with Gizmo Controls
interface EnhancedWorldObjectRendererProps {
  object: any;
  isSelected: boolean;
  isPreviewMode: boolean;
  transformMode: 'translate' | 'rotate' | 'scale';
  gizmoType: 'pivot' | 'transform';
}

const EnhancedWorldObjectRenderer: React.FC<EnhancedWorldObjectRendererProps> = ({ 
  object, 
  isSelected, 
  isPreviewMode,
  transformMode,
  gizmoType
}) => {
  const { selectObject, updateObject } = useWorldBuilderStore();
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

  const renderWithGizmo = () => {
    const objectMesh = (
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
            {objectMesh}
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
            {objectMesh}
          </>
        );
      }
    }

    return objectMesh;
  };

  return renderWithGizmo();
};

// Simple object mesh renderer (you'd replace this with your actual object types)
const ObjectMesh: React.FC<{ object: any }> = ({ object }) => {
  const getColor = () => {
    switch (object.type) {
      case 'tree-simple': return '#8B4513';
      case 'tree-berry': return '#228B22';
      case 'tree-evergreen': return '#006400';
      default: return '#888888';
    }
  };

  return (
    <mesh>
      <boxGeometry args={[0.5, 2, 0.5]} />
      <meshStandardMaterial color={getColor()} />
    </mesh>
  );
};

export default EnhancedWorldBuilderCanvas;
