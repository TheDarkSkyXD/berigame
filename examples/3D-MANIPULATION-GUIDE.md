# 3D Object Manipulation with Axis Gizmos - Complete Guide

## Overview

This guide shows how to implement professional 3D object manipulation controls in React Three Fiber applications, similar to what you see in Blender, Maya, or Unity.

## Available Control Types

### 1. PivotControls (Recommended)
- **Modern approach** with HTML annotations
- **Better UX** with visual feedback
- **More features** like snap-to-grid, custom anchors
- **Responsive design** with customizable styling

### 2. TransformControls
- **Traditional Three.js** approach
- **Reliable and stable** 
- **Simpler implementation**
- **Classic 3D software feel**

## Key Features

### Visual Gizmos
- **Red handle** = X-axis manipulation
- **Green handle** = Y-axis manipulation  
- **Blue handle** = Z-axis manipulation
- **Yellow highlight** on hover
- **Plane handles** for multi-axis movement

### Transform Modes
- **Translate** - Move objects in 3D space
- **Rotate** - Rotate around axes
- **Scale** - Resize objects uniformly or per-axis

### Advanced Features
- **HTML annotations** showing real-time values
- **Snap to grid** (hold Tab while dragging)
- **Custom pivot points** (center, corner, edge)
- **Controlled transforms** for external state management
- **Multi-object selection** support

## Implementation Steps

### Step 1: Install Dependencies
```bash
npm install @react-three/drei @react-three/fiber three
```

### Step 2: Basic PivotControls Setup
```tsx
import { PivotControls } from '@react-three/drei';

<PivotControls>
  <mesh>
    <boxGeometry args={[1, 1, 1]} />
    <meshStandardMaterial color="orange" />
  </mesh>
</PivotControls>
```

### Step 3: Add Transform Mode Controls
```tsx
const [mode, setMode] = useState<'translate' | 'rotate' | 'scale'>('translate');

<PivotControls
  disableAxes={mode !== 'translate'}
  disableRotations={mode !== 'rotate'}
  disableScaling={mode !== 'scale'}
  annotations={true}
>
  {/* Your 3D object */}
</PivotControls>
```

### Step 4: Handle Transform Events
```tsx
<PivotControls
  onDragStart={() => console.log('Transform started')}
  onDrag={(localMatrix, deltaLocal, worldMatrix, deltaWorld) => {
    // Handle real-time transform updates
    updateObjectTransform(worldMatrix);
  }}
  onDragEnd={() => console.log('Transform finished')}
>
  {/* Your object */}
</PivotControls>
```

## Configuration Options

### PivotControls Props
```tsx
interface PivotControlsProps {
  // Core functionality
  enabled?: boolean;                    // Enable/disable controls
  autoTransform?: boolean;              // Auto-apply transforms
  
  // Visual customization
  scale?: number;                       // Gizmo size
  lineWidth?: number;                   // Handle thickness
  axisColors?: [string, string, string]; // RGB colors for XYZ
  hoveredColor?: string;                // Hover highlight color
  
  // Transform constraints
  disableAxes?: boolean;                // Disable translation
  disableRotations?: boolean;           // Disable rotation
  disableScaling?: boolean;             // Disable scaling
  activeAxes?: [boolean, boolean, boolean]; // Enable specific axes
  
  // Positioning
  anchor?: [number, number, number];    // Pivot point (-1 to 1)
  offset?: [number, number, number];    // Position offset
  
  // Features
  annotations?: boolean;                // Show value labels
  annotationsClass?: string;            // CSS class for labels
  fixed?: boolean;                      // Fixed screen size
  
  // Events
  onDragStart?: () => void;
  onDrag?: (matrices) => void;
  onDragEnd?: () => void;
}
```

### TransformControls Props
```tsx
interface TransformControlsProps {
  mode?: 'translate' | 'rotate' | 'scale';
  object?: React.RefObject<THREE.Object3D>;
  onObjectChange?: (event) => void;
  enabled?: boolean;
  axis?: 'X' | 'Y' | 'Z' | 'XY' | 'XZ' | 'YZ' | 'XYZ';
  space?: 'world' | 'local';
  size?: number;
  showX?: boolean;
  showY?: boolean;
  showZ?: boolean;
}
```

## Integration with Your World Builder

### 1. Add to WorldBuilderCanvas.tsx
```tsx
import { PivotControls } from '@react-three/drei';

// In your object renderer
{isSelected && !isPreviewMode && (
  <PivotControls
    disableAxes={transformMode !== 'translate'}
    disableRotations={transformMode !== 'rotate'}
    disableScaling={transformMode !== 'scale'}
    annotations={true}
    onDrag={handleTransform}
  >
    <YourObjectComponent />
  </PivotControls>
)}
```

### 2. Update Your Store
```tsx
interface WorldBuilderState {
  transformMode: 'translate' | 'rotate' | 'scale';
  gizmoType: 'pivot' | 'transform';
  setTransformMode: (mode) => void;
  setGizmoType: (type) => void;
}
```

### 3. Add UI Controls
```tsx
<div className="gizmo-controls">
  <button onClick={() => setTransformMode('translate')}>
    Translate
  </button>
  <button onClick={() => setTransformMode('rotate')}>
    Rotate
  </button>
  <button onClick={() => setTransformMode('scale')}>
    Scale
  </button>
</div>
```

## Best Practices

### Performance
- Use `autoTransform={false}` for better control
- Implement debounced updates for real-time sync
- Only show gizmos for selected objects

### UX Guidelines
- **Red = X-axis** (left/right)
- **Green = Y-axis** (up/down)  
- **Blue = Z-axis** (forward/back)
- Show transform values in real-time
- Provide keyboard shortcuts (Tab for snap)

### Integration Tips
- Disable OrbitControls during transform with `makeDefault`
- Use `event.stopPropagation()` on object clicks
- Implement undo/redo for transform operations
- Save transform state to your backend

## Keyboard Shortcuts

- **Tab** - Snap to grid while dragging
- **Shift** - Constrain to single axis
- **Ctrl** - Duplicate while moving
- **Alt** - Rotate around world center
- **G** - Grab/translate mode
- **R** - Rotate mode  
- **S** - Scale mode

## Styling

Include the provided CSS file for professional-looking annotations:

```tsx
import './gizmo-styles.css';

<PivotControls
  annotations={true}
  annotationsClass="world-builder-annotation"
>
  {/* Your objects */}
</PivotControls>
```

## Advanced Features

### Custom Pivot Points
```tsx
// Center pivot (default)
<PivotControls anchor={[0, 0, 0]}>

// Bottom pivot  
<PivotControls anchor={[0, -1, 0]}>

// Corner pivot
<PivotControls anchor={[-1, -1, -1]}>
```

### Controlled Transforms
```tsx
const [matrix, setMatrix] = useState(new THREE.Matrix4());

<PivotControls
  matrix={matrix}
  autoTransform={false}
  onDrag={(local, deltaLocal, world, deltaWorld) => {
    setMatrix(world.clone());
    // Update your object manually
  }}
>
```

### Multi-Object Selection
```tsx
{selectedObjects.map(obj => (
  <PivotControls key={obj.id}>
    <ObjectRenderer object={obj} />
  </PivotControls>
))}
```

## Troubleshooting

### Common Issues
1. **Gizmo not appearing** - Check if object is selected and not in preview mode
2. **Controls interfering** - Use `makeDefault` on OrbitControls
3. **Transform not applying** - Verify `autoTransform` setting
4. **Performance issues** - Limit gizmos to selected objects only

### Debug Tips
- Use browser dev tools to inspect transform matrices
- Log transform events to understand data flow
- Check Three.js object hierarchy in scene graph

## Examples

See the provided example files:
- `3d-manipulation-examples.tsx` - Basic implementations
- `world-builder-with-gizmos.tsx` - Full integration example
- `gizmo-styles.css` - Professional styling

This gives you everything needed to implement professional 3D object manipulation in your React Three Fiber application!
