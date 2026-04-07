# Spatial Context Modeller

A browser-based 3D spatial editor for modelling physical environments and exporting structured context that AI agents can understand. Built with React, Three.js (via React Three Fiber), and Zustand.

## What It Does

Spatial Context Modeller lets you build a 3D representation of a physical space -- rooms, sensors, cameras, light panels, tracking zones -- and define relationships between objects. The scene can be exported as a structured context description ready to paste into an AI agent prompt, giving the agent full spatial awareness of your environment.

### Core Concepts

- **Objects** -- 3D primitives (box, plane, point, zone, group, mesh, sensor, camera) placed in a scene
- **Roles** -- Each object has a functional role: `actuator`, `sensor`, `zone`, `structural`, or `reference`
- **References** -- Named relationships between objects (e.g. camera *observes* zone, zone *triggers* actuator)
- **Context Export** -- Generates a Markdown summary of the scene grouped by role, with positions, dimensions, and relationships

### Object Types

| Type | Description | Use Case |
|------|-------------|----------|
| Box | 3D volume (width, height, depth) | Walls, columns, furniture |
| Plane | Flat surface | Light panels, screens, floors |
| Point | Position marker (sphere) | Cameras, reference points |
| Zone | Trigger volume (translucent wireframe) | Tracking areas, detection regions |
| Group | Logical container | Grouping related objects |
| Mesh | Imported OBJ geometry | Scanned environments, complex shapes |
| Sensor | Directional cone | Distance sensors, microphones |
| Camera | FOV frustum | Surveillance or tracking cameras |

### Role Color Coding

- **Amber** -- Actuators (light panels, speakers, motors)
- **Blue** -- Sensors (cameras, microphones, distance sensors)
- **Green** -- Zones (spatial trigger regions)
- **Gray** -- Structural (walls, floors, columns)
- **Purple** -- Reference (calibration/alignment markers)

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
cd spatial-context-modeller
npm install
```

### Launch

```bash
npm run dev
```

Opens a local dev server (default: `http://localhost:5173`). The editor loads in the browser.

### Build for Production

```bash
npm run build
npm run preview
```

## Usage

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| W / G | Translate mode |
| R | Rotate mode |
| S | Scale mode |
| Cmd+Z | Undo |
| Cmd+Shift+Z | Redo |
| Delete / Backspace | Delete selected object |
| Escape | Deselect |

### Workflow

1. Add objects from the toolbar (left side)
2. Select and position them using the transform gizmo
3. Set roles and tags in the Inspector (right side)
4. Define relationships between objects (Inspector > References)
5. Edit the live JSON directly in the JSON panel (left, collapsible)
6. **Export Context** to get a structured description for AI agents
7. **Save** to download the scene as a `.json` file
8. **Open** to load a previously saved scene
9. **Import OBJ** to bring in mesh geometry from `.obj` files
10. **Load Demo** to see the built-in Drop Ceiling demo scene

### Scene JSON Format

Scenes are stored as JSON with this structure:

```json
{
  "name": "My Scene",
  "version": "1.0",
  "units": "centimeters",
  "coordinate_system": {
    "origin": "User-defined",
    "x_axis": "Right",
    "y_axis": "Up",
    "z_axis": "Forward"
  },
  "objects": [],
  "references": []
}
```

## Project Structure

```
src/
  App.jsx              # Main layout (three-column: JSON panel, viewport, inspector)
  App.css              # All styles
  main.jsx             # React entry point
  schema.js            # Scene schema, object types, roles, factory functions
  store.js             # Zustand store with undo/redo history
  components/
    ContextModal.jsx   # Modal for agent context export
    Inspector.jsx      # Property editor for selected objects
    JsonPanel.jsx      # Live JSON editor (bidirectional sync)
    ReferenceLines.jsx # Dashed lines between related objects
    SceneObjects.jsx   # 3D renderers for all object types
    Toolbar.jsx        # Object creation + transform mode buttons
    TopBar.jsx         # Scene name, file actions, import/export
    TransformWrapper.jsx # Transform gizmo on selected object
    Viewport.jsx       # Three.js canvas with orbit controls and grid
  utils/
    contextExport.js   # Generates agent-readable Markdown from scene
    dropCeilingConverter.js # Converts world_coordinates.json to scene schema
    objParser.js       # Wavefront OBJ file parser
```

## Tech Stack

- **React 19** -- UI framework
- **Three.js** (via `@react-three/fiber` + `@react-three/drei`) -- 3D rendering
- **Zustand** (with Immer middleware) -- State management with undo/redo
- **Vite** -- Dev server and build tool
