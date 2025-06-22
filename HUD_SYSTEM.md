# HUD (Heads-Up Display) System

## Overview
The HUD system provides players with a movable, toggleable interface that displays essential game information and quick-access functionality. It includes a health bar and three quick-use item slots for consumables.

## Features

### Health Bar
- **Visual Display**: Shows current health vs maximum health with a colored progress bar
- **Color Coding**: 
  - Green: Health > 60%
  - Orange: Health 30-60%
  - Red: Health < 30%
- **Numeric Display**: Shows exact health values (e.g., "25/30")

### Quick-Use Slots
- **Three Slots**: Numbered 1, 2, and 3 for easy identification
- **Berry Support**: Currently supports berry items for quick consumption
- **Drag & Drop**: Drag berries from inventory to quick-use slots
- **Visual Feedback**: 
  - Green background when item is usable
  - Gray background when health is full (item not usable)
  - Quantity indicators for stacked items
- **Auto-Sync**: Automatically updates when inventory changes

### Positioning & Visibility
- **Draggable**: Click and drag the HUD to reposition it anywhere on screen
- **Persistent Position**: HUD position is saved to localStorage and restored on reload
- **Toggle Visibility**: Hide/show the HUD with the 'H' key
- **Boundary Constraints**: HUD stays within screen boundaries when dragged

## Controls

### Keyboard Shortcuts
- **H**: Toggle HUD visibility
- **1, 2, 3**: Use items in quick-use slots 1, 2, and 3 respectively

### Mouse Controls
- **Click & Drag**: Move the HUD by clicking and dragging the header area
- **Click Quick-Use Slot**: Consume the item in that slot
- **Drag from Inventory**: Drag berry items from inventory to quick-use slots
- **Close Button**: Click the × button to hide the HUD

## Technical Implementation

### Components
- **`HUD.tsx`**: Main HUD component with health bar and quick-use slots
- **`QuickUseSlot.tsx`**: Individual quick-use slot component with drag/drop support

### State Management
- **`useHUDStore`**: Zustand store managing HUD state
  - `isVisible`: HUD visibility state
  - `position`: HUD screen position (x, y coordinates)
  - `quickUseSlots`: Array of three item slots
  - `isDragging`: Drag state for UI feedback

### Key Functions
```javascript
// Toggle HUD visibility
toggleVisibility()

// Set HUD position
setPosition({ x: 100, y: 50 })

// Assign item to quick-use slot
setQuickUseSlot(slotIndex, item)

// Clear quick-use slot
clearQuickUseSlot(slotIndex)
```

### Integration Points
- **Inventory System**: Drag & drop integration for item assignment
- **Health System**: Real-time health display from `useUserStateStore`
- **Berry Consumption**: Reuses existing berry consumption logic
- **Chat System**: Respects chat focus state for keyboard shortcuts

## Styling

### CSS Classes
- `.hud-container`: Main HUD container with backdrop blur effect
- `.hud-header`: Header area with title and close button
- `.hud-toggle-button`: Show HUD button when hidden
- `.quick-use-slot`: Individual quick-use slot styling

### Visual Design
- **Dark Theme**: Semi-transparent black background with blur effect
- **Rounded Corners**: Modern UI with 8px border radius
- **Hover Effects**: Subtle animations and color changes
- **Responsive**: Adapts to different screen sizes

## Usage Examples

### Basic Usage
1. **View Health**: Health bar is always visible when HUD is shown
2. **Add Quick Items**: Drag berries from inventory to quick-use slots
3. **Use Items**: Click slots or press 1/2/3 keys to consume items
4. **Reposition**: Drag HUD to preferred screen location
5. **Toggle**: Press 'H' to hide/show HUD

### Advanced Features
- **Persistent Setup**: HUD remembers position between game sessions
- **Inventory Sync**: Quick-use slots automatically update when items are consumed elsewhere
- **Keyboard Efficiency**: Use number keys for rapid item consumption during combat

## Testing

### Unit Tests (`hud.test.js`)
- HUD store initialization and state management
- Visibility toggling functionality
- Position setting and persistence
- Quick-use slot assignment and clearing
- Multiple slot independence

### Manual Testing
1. **Drag Functionality**: Verify HUD can be moved around screen
2. **Keyboard Shortcuts**: Test H key toggle and 1/2/3 consumption
3. **Inventory Integration**: Test drag & drop from inventory
4. **Health Display**: Verify health bar updates correctly
5. **Persistence**: Check position saves/loads on page refresh

## Future Enhancements

### Potential Features
- **Customizable Slots**: Allow more than 3 quick-use slots
- **Item Types**: Support for other consumable items beyond berries
- **Hotkey Customization**: Allow players to rebind keyboard shortcuts
- **HUD Themes**: Multiple visual themes and transparency options
- **Minimap Integration**: Add minimap to HUD
- **Status Effects**: Display active buffs/debuffs
- **Resource Bars**: Mana, stamina, or other resource tracking

### Technical Improvements
- **Performance**: Optimize re-renders with React.memo
- **Accessibility**: Add ARIA labels and keyboard navigation
- **Mobile Support**: Touch-friendly controls for mobile devices
- **Animation**: Smooth transitions for show/hide and slot updates

## Configuration

### Default Settings
- **Position**: Top-left corner (20px, 20px)
- **Visibility**: Visible by default
- **Quick-Use Slots**: 3 empty slots
- **Health Bar**: Shows current/max health with color coding

### Customization
Position and visibility preferences are automatically saved to browser localStorage and restored on subsequent visits.
