import React from 'react';
import { useWorldBuilderStore } from '../store/worldBuilderStore';
import '../styles/gizmo-styles.css';

const TransformControlsPanel: React.FC = () => {
  const { 
    selectedObjectId,
    transformMode,
    gizmoType,
    showTransformValues,
    setTransformMode,
    setGizmoType,
    setShowTransformValues,
    selectObject,
    currentWorld
  } = useWorldBuilderStore();

  const selectedObject = currentWorld?.objects.find(obj => obj.id === selectedObjectId);

  return (
    <div className="transform-controls-panel">
      <h3>Transform Controls</h3>
      
      {/* Gizmo Type Selection */}
      <div className="control-group">
        <label>Gizmo Type:</label>
        <select 
          value={gizmoType} 
          onChange={(e) => setGizmoType(e.target.value as 'pivot' | 'transform')}
        >
          <option value="pivot">PivotControls (Modern)</option>
          <option value="transform">TransformControls (Classic)</option>
        </select>
      </div>
      
      {/* Transform Mode Selection */}
      <div className="control-group">
        <label>Transform Mode:</label>
        <div className="button-group">
          <button 
            className={transformMode === 'translate' ? 'active' : ''}
            onClick={() => setTransformMode('translate')}
            title="Move objects (G)"
          >
            Move
          </button>
          <button 
            className={transformMode === 'rotate' ? 'active' : ''}
            onClick={() => setTransformMode('rotate')}
            title="Rotate objects (R)"
          >
            Rotate
          </button>
          <button 
            className={transformMode === 'scale' ? 'active' : ''}
            onClick={() => setTransformMode('scale')}
            title="Scale objects (S)"
          >
            Scale
          </button>
        </div>
      </div>

      {/* Transform Values Toggle */}
      <div className="control-group">
        <div className="button-group">
          <button 
            className={showTransformValues ? 'active' : ''}
            onClick={() => setShowTransformValues(!showTransformValues)}
          >
            Show Values
          </button>
        </div>
      </div>
      
      {/* Selected Object Info */}
      {selectedObject ? (
        <div className="selected-info">
          <div>Selected: {selectedObject.type}</div>
          <div>ID: {selectedObject.id.substring(0, 8)}...</div>
          <button 
            className="danger"
            onClick={() => selectObject(null)}
            style={{ marginTop: '8px', width: '100%' }}
          >
            Deselect
          </button>
        </div>
      ) : (
        <div className="selected-info">
          No object selected
        </div>
      )}
    </div>
  );
};

const TransformValuesPanel: React.FC = () => {
  const { selectedObjectId, currentWorld, showTransformValues } = useWorldBuilderStore();
  
  if (!showTransformValues || !selectedObjectId) return null;
  
  const selectedObject = currentWorld?.objects.find(obj => obj.id === selectedObjectId);
  if (!selectedObject) return null;

  const formatValue = (value: number) => value.toFixed(2);
  const formatDegrees = (radians: number) => (radians * 180 / Math.PI).toFixed(1);

  return (
    <div className="transform-values-panel">
      <h4>Transform Values</h4>
      
      <div className="value-row">
        <span className="value-label">Position:</span>
        <span className="value-data"></span>
      </div>
      <div className="value-row">
        <span className="value-label axis-x">X:</span>
        <span className="value-data">{formatValue(selectedObject.position.x)}</span>
      </div>
      <div className="value-row">
        <span className="value-label axis-y">Y:</span>
        <span className="value-data">{formatValue(selectedObject.position.y)}</span>
      </div>
      <div className="value-row">
        <span className="value-label axis-z">Z:</span>
        <span className="value-data">{formatValue(selectedObject.position.z)}</span>
      </div>
      
      <div className="value-row">
        <span className="value-label">Rotation:</span>
        <span className="value-data"></span>
      </div>
      <div className="value-row">
        <span className="value-label axis-x">X:</span>
        <span className="value-data">{formatDegrees(selectedObject.rotation.x)}°</span>
      </div>
      <div className="value-row">
        <span className="value-label axis-y">Y:</span>
        <span className="value-data">{formatDegrees(selectedObject.rotation.y)}°</span>
      </div>
      <div className="value-row">
        <span className="value-label axis-z">Z:</span>
        <span className="value-data">{formatDegrees(selectedObject.rotation.z)}°</span>
      </div>
      
      <div className="value-row">
        <span className="value-label">Scale:</span>
        <span className="value-data"></span>
      </div>
      <div className="value-row">
        <span className="value-label axis-x">X:</span>
        <span className="value-data">{formatValue(selectedObject.scale.x)}</span>
      </div>
      <div className="value-row">
        <span className="value-label axis-y">Y:</span>
        <span className="value-data">{formatValue(selectedObject.scale.y)}</span>
      </div>
      <div className="value-row">
        <span className="value-label axis-z">Z:</span>
        <span className="value-data">{formatValue(selectedObject.scale.z)}</span>
      </div>
    </div>
  );
};

const KeyboardHelpPanel: React.FC = () => {
  const { selectedObjectId } = useWorldBuilderStore();
  
  if (!selectedObjectId) return null;

  return (
    <div className="keyboard-help-panel">
      <h5>Keyboard Shortcuts</h5>
      
      <div className="shortcut">
        <span className="key">Tab</span>
        <span className="description">Snap to grid while dragging</span>
      </div>
      
      <div className="shortcut">
        <span className="key">G</span>
        <span className="description">Switch to move mode</span>
      </div>
      
      <div className="shortcut">
        <span className="key">R</span>
        <span className="description">Switch to rotate mode</span>
      </div>
      
      <div className="shortcut">
        <span className="key">S</span>
        <span className="description">Switch to scale mode</span>
      </div>
      
      <div className="shortcut">
        <span className="key">Esc</span>
        <span className="description">Deselect object</span>
      </div>
      
      <div className="shortcut">
        <span className="key">Del</span>
        <span className="description">Delete selected object</span>
      </div>
    </div>
  );
};

export { TransformControlsPanel, TransformValuesPanel, KeyboardHelpPanel };
