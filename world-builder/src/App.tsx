import React, { useEffect } from 'react';
import WorldBuilderCanvas from './components/WorldBuilderCanvas';
import ObjectPalette from './components/ObjectPalette';
import WorldSaver from './components/WorldSaver';
import { TransformControlsPanel, TransformValuesPanel, KeyboardHelpPanel } from './components/TransformControls';
import { useWorldBuilderStore } from './store/worldBuilderStore';

const App: React.FC = () => {
  const {
    currentWorld,
    isPreviewMode,
    selectedObjectId,
    transformMode,
    setTransformMode,
    selectObject,
    removeObject
  } = useWorldBuilderStore();

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return; // Don't trigger shortcuts when typing in inputs
      }

      switch (event.key.toLowerCase()) {
        case 'g':
          event.preventDefault();
          setTransformMode('translate');
          break;
        case 'r':
          event.preventDefault();
          setTransformMode('rotate');
          break;
        case 's':
          event.preventDefault();
          setTransformMode('scale');
          break;
        case 'escape':
          event.preventDefault();
          selectObject(null);
          break;
        case 'delete':
        case 'backspace':
          if (selectedObjectId) {
            event.preventDefault();
            removeObject(selectedObjectId);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedObjectId, setTransformMode, selectObject, removeObject]);

  return (
    <div style={{ 
      width: '100vw', 
      height: '100vh', 
      display: 'flex',
      fontFamily: 'Arial, sans-serif',
      backgroundColor: '#1a1a1a',
      color: '#ffffff'
    }}>
      {/* Left Sidebar */}
      <div style={{
        width: '300px',
        backgroundColor: '#2a2a2a',
        borderRight: '1px solid #444',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '20px',
          borderBottom: '1px solid #444',
          backgroundColor: '#333'
        }}>
          <h1 style={{ 
            margin: '0 0 10px 0', 
            fontSize: '24px',
            color: '#4CAF50'
          }}>
            BeriGame World Builder
          </h1>
          <p style={{ 
            margin: 0, 
            fontSize: '14px', 
            color: '#aaa' 
          }}>
            {currentWorld ? `Editing: ${currentWorld.name}` : 'No world loaded'}
          </p>
        </div>
        
        <WorldSaver />
        
        {!isPreviewMode && <ObjectPalette />}
      </div>

      {/* Main Canvas Area */}
      <div style={{ flex: 1, position: 'relative' }}>
        <WorldBuilderCanvas />

        {/* Transform Controls Overlay */}
        {!isPreviewMode && <TransformControlsPanel />}
        {!isPreviewMode && <TransformValuesPanel />}
        {!isPreviewMode && <KeyboardHelpPanel />}

        {/* Top-right controls */}
        <div style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          zIndex: 1000
        }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <ModeToggle />
            <GridControls />
          </div>
          {!isPreviewMode && (
            <div style={{
              background: 'rgba(0, 0, 0, 0.8)',
              color: 'white',
              padding: '8px 12px',
              borderRadius: '4px',
              fontSize: '12px',
              textAlign: 'center',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              Mode: {transformMode.toUpperCase()} ({transformMode === 'translate' ? 'G' : transformMode === 'rotate' ? 'R' : 'S'})
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ModeToggle: React.FC = () => {
  const { isPreviewMode, setPreviewMode } = useWorldBuilderStore();
  
  return (
    <button
      onClick={() => setPreviewMode(!isPreviewMode)}
      style={{
        padding: '10px 15px',
        backgroundColor: isPreviewMode ? '#4CAF50' : '#666',
        color: 'white',
        border: 'none',
        borderRadius: '5px',
        cursor: 'pointer',
        fontSize: '14px'
      }}
    >
      {isPreviewMode ? 'Exit Preview' : 'Preview Mode'}
    </button>
  );
};

const GridControls: React.FC = () => {
  const { showGrid, setShowGrid, snapToGrid, setSnapToGrid } = useWorldBuilderStore();
  
  return (
    <div style={{ display: 'flex', gap: '5px' }}>
      <button
        onClick={() => setShowGrid(!showGrid)}
        style={{
          padding: '10px',
          backgroundColor: showGrid ? '#4CAF50' : '#666',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer',
          fontSize: '12px'
        }}
      >
        Grid
      </button>
      <button
        onClick={() => setSnapToGrid(!snapToGrid)}
        style={{
          padding: '10px',
          backgroundColor: snapToGrid ? '#4CAF50' : '#666',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer',
          fontSize: '12px'
        }}
      >
        Snap
      </button>
    </div>
  );
};

export default App;
