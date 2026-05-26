# MAPit User Guide

MAPit is an offline 2D mini-map editor for creating game-ready tactical maps, layout sketches and exported layer packages. It runs locally in the browser through the included Windows start script and does not require external CDN access.

## Starting MAPit

1. Extract the ZIP package.
2. Run `start_MAPit.bat` from the project root.
3. The browser opens `http://127.0.0.1:5501/`.
4. Keep the console window open while working. Closing it stops the local server.

The application is designed for local use. All runtime files are stored in the project folder.

## Project Workflow

Use the top bar to manage projects:

- **Project** opens the project menu with options to create a new empty project, save a project, or load an existing `.MAPit` file.
- **Export** opens raster, JSON and ZIP export options.
- **History** opens the undo and redo panel with a readable action list.
- **Help** opens this documentation inside MAPit.

A `.MAPit` file is JSON-based and stores canvas settings, objects, layers, patterns, imported icon data and metadata.

## Editor Navigation

The editor canvas supports detailed work on top of an imported reference map.

- Use the **Zoom** slider in the editor card to zoom from 25% to 400%.
- Use the plus and minus buttons for quick zoom steps.
- Use the target button in the zoom control to reset the view to 100% and center it.
- Use the mouse wheel over the editor for cursor-centered zooming.
- Hold **Space** and drag to pan the view.
- Use the **Pan View** tool for mouse-only panning.

## Background Images

The **Background** card imports reference images for tracing roads and buildings.

Available controls:

- Import or clear a background image.
- Choose contain or cover fit behavior.
- Adjust opacity, brightness, contrast and grayscale.

Background images are stored in the project file as data URLs so the project remains portable.

## Roads and Splines

Roads are spline-based paths. Select the Road/Spline tool and click points in the editor to build the path. Press the Finish Road button when the road is complete.

Road options include:

- Asphalt, trail, dirt, river, rail and border presets.
- Automatic road design toggle.
- Width, glow, opacity and solid fill controls.
- Centerline strength and color.
- Edge line strength and edge width.
- Edge softness and rough/frayed dirt-road edges.

Selected roads update live when values change in the Style Manager.

## Buildings

Buildings can be created in three ways:

1. Use the Building Block tool and drag a rectangle in the editor.
2. Use the **Buildings** card in the left panel and activate **Stamp Building** for fixed-size placement.
3. Use Generate Buildings for quick block distribution.

Building controls include width, height, fill color, outline color, glow, corner radius, shadow, density and opacity. Buildings can be selected, moved and transformed after placement.

## Symbols and Icons

The **Symbols** card contains integrated symbol libraries and imported/folder symbols.

Integrated categories include:

- Objectives and alerts.
- Buildings and facilities.
- Vehicles.
- Sci-Fi and utility symbols.

You can place symbols in two ways:

- Click a symbol, activate the icon tool, then click in the editor.
- Drag a symbol directly from the library into the editor.

Every placed symbol receives its own layer. This makes it easy to rename, hide, lock, export or delete individual symbol placements.

## Imported Symbol Folder

MAPit can load local symbol assets from:

`assets/imported_symbols/`

Supported formats include `.png`, `.ico`, `.webp`, `.jpg`, `.jpeg` and `.svg`, depending on browser support.

The folder contains a `manifest.json` file. Add filenames there to make local assets appear reliably in the imported symbols list. Some browsers do not allow directory listing, so the manifest is the most reliable method.

## Map Boundary

The Map Boundary feature creates a tactical map mask similar to a marked play area.

Use it to:

- Draw or generate an irregular map boundary.
- Dim the outside area.
- Apply fill, outline, glow and opacity styling.
- Select and reshape boundary points.

The Map Boundary is stored as a terrain object and can be exported like other layers.

## Pattern Overlay and Canvas Grid

Pattern overlays are layer-based and can be stacked.

Built-in pattern types include dots, diagonal lines, grid, hex, scanlines, hatching, plus marks, triangles, honeycomb, cross marks and rings.

Each pattern can have its own layer. Use this to combine multiple transparent patterns into custom background styles.

The **Global Canvas Grid** is different from pattern overlays. It is an editor-view grid for alignment and measuring. It can be toggled in the Global tab and adjusted by grid size, opacity and color.

## Layer Manager

The Layer Manager controls draw order and export structure.

Each layer row provides:

- Editable export name.
- Editable export description.
- Visibility toggle.
- Lock toggle.
- Export toggle.
- Delete action.
- Drag handle for reordering layers.

To reorder layers, drag a layer row by its handle and drop it above or below another layer. The order controls how objects are drawn and exported.

## History

History is available from the top bar.

- Undo and redo are available in the History menu.
- The list shows recent actions.
- Common operations such as placing, moving, styling, generating and deleting objects create history entries.

## Export Options

The Export menu provides:

- PNG image export.
- JPG image export.
- WEBP image export.
- Active layer PNG export.
- Layers JSON export.
- Layer Package ZIP export.

The layer ZIP package includes the project file, a manifest, per-layer JSON files and icon references.

## Keyboard Shortcuts

- **V**: Select / Move.
- **P**: Road / Spline.
- **B**: Building block.
- **M**: Marker.
- **I**: Icon placement.
- **Delete**: Delete selected objects or use delete-area mode.
- **Ctrl + Z**: Undo.
- **Ctrl + Y**: Redo.
- **Space + Drag**: Pan the editor view.
- **Escape**: Clear selection or close dialogs.

## Local Dependencies

MAPit is intentionally offline-first.

Required runtime components:

- A modern Chromium, Edge or Firefox browser.
- Python installed on Windows for `python -m http.server` or `py -m http.server`.
- Local project assets under `assets/`.

Included project folders:

- `assets/css/` contains the MAPit UI stylesheet.
- `assets/js/` contains the editor engine, history manager and ZIP helper.
- `assets/img/` contains logo and favicon assets.
- `assets/vendor/bootstrap/` contains local Bootstrap placeholder runtime files for offline structure compatibility.
- `assets/imported_symbols/` contains user-expandable local symbol assets.
- `exports/` is reserved for user exports.
- `preview/` is reserved for manually created preview images.

### compliactiion aka sksdesign 26.05.2026


