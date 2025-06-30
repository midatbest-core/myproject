// Modern Drawing Pad - Robust Version
// Author: AI Refactor
// Uses Fabric.js

class DrawingPad {
  constructor() {
    this.canvas = null;
    this.tool = 'brush';
    this.color = '#23243a';
    this.thickness = 6;
    this.font = 'Montserrat';
    this.fontSize = 28;
    this.undoStack = [];
    this.redoStack = [];
    this.textMode = false;
    this.isInitialized = false;
    this.boundResizeHandler = this.resizeCanvasResponsive.bind(this);
    this.brushType = 'pencil';
    this.activeBrush = null;
    this._prevColor = null;
    this._eraserHandlers = null;
  }

  init() {
    if (this.isInitialized) return;
    const el = document.getElementById('drawingCanvas');
    if (!el) return;
    let width = 1100, height = 600;
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    if (vw < 1200) {
      width = Math.floor(vw * 0.9);
      height = Math.floor(width * 0.55);
    }
    if (vw < 700) {
      width = Math.floor(vw * 0.98);
      height = Math.floor(width * 0.6);
    }
    el.width = width;
    el.height = height;
    el.style.width = width + 'px';
    el.style.height = height + 'px';
    this.canvas = new fabric.Canvas('drawingCanvas', {
      isDrawingMode: true,
      backgroundColor: '#fff',
      width,
      height,
      selection: true,
      preserveObjectStacking: true,
      enableRetinaScaling: true,
      renderOnAddRemove: true
    });
    this.setupEventListeners();
    this.setTool('brush');
    this.renderToolbar();
    this.isInitialized = true;
    this.pushUndo();
    this.updateUndoRedoButtons();
  }

  setupEventListeners() {
    // Only attach once
    this.canvas.on('object:added', (e) => { if (!e.target._undoIgnore) this.pushUndo(); });
    this.canvas.on('object:modified', () => this.pushUndo());
    this.canvas.on('object:removed', () => this.pushUndo());
    this.canvas.on('path:created', (e) => {
      if (e && e.path) {
        e.path.set({ selectable: true, hasControls: true, evented: true });
        this.canvas.renderAll();
        this.pushUndo();
      }
    });
    this.canvas.on('mouse:down', (opt) => {
      if (this.textMode) this.addTextAtPointer(opt);
    });
    this.canvas.on('mouse:dblclick', (opt) => {
      const target = opt.target;
      if (target) {
        target.set({ hasControls: true, borderColor: '#6c63ff', cornerColor: '#ffd166', cornerSize: 16 });
        this.canvas.setActiveObject(target);
        this.canvas.renderAll();
      }
    });
    document.addEventListener('keydown', (e) => {
      const active = this.canvas.getActiveObject();
      if ((e.key === 'Delete' || e.key === 'Backspace') && active && active.isEditing) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.canvas.getActiveObject()) {
        this.canvas.remove(this.canvas.getActiveObject());
        this.canvas.discardActiveObject();
        this.canvas.requestRenderAll();
      }
    });
    window.addEventListener('resize', this.boundResizeHandler);
  }

  renderToolbar() {
    const tb = document.getElementById('drawingPadToolbar');
    if (!tb) return;
    tb.className = 'drawing-toolbar';
    tb.innerHTML = `
        <button id="toolSelect" data-tippy-content="Select/Move (V)" class="${this.tool==='select'?'selected':''}"><i class="fa-solid fa-arrow-pointer"></i></button>
        <button id="toolBrush" data-tippy-content="Brush (B)" class="${this.tool==='brush'?'selected':''}"><i class="fa-solid fa-paintbrush"></i></button>
        <select id="brushTypePicker" title="Brush Type" style="margin-right:1rem;">
          <option value="pencil" ${this.brushType==='pencil'?'selected':''}>Pencil</option>
          <option value="spray" ${this.brushType==='spray'?'selected':''}>Spray</option>
          <option value="pattern" ${this.brushType==='pattern'?'selected':''}>Pattern</option>
          <option value="marker" ${this.brushType==='marker'?'selected':''}>Marker</option>
        </select>
        <button id="toolEraser" data-tippy-content="Eraser (E)" class="${this.tool==='eraser'?'selected':''}"><i class="fa-solid fa-eraser"></i> Eraser</button>
        <button id="toolLine" data-tippy-content="Line (L)" class="${this.tool==='line'?'selected':''}"><i class="fa-solid fa-slash"></i></button>
        <button id="toolRect" data-tippy-content="Rectangle (R)" class="${this.tool==='rect'?'selected':''}"><i class="fa-regular fa-square"></i></button>
        <button id="toolEllipse" data-tippy-content="Ellipse (O)" class="${this.tool==='ellipse'?'selected':''}"><i class="fa-regular fa-circle"></i></button>
        <button id="toolText" data-tippy-content="Text (T)" class="${this.tool==='text'?'selected':''}"><i class="fa-solid fa-font"></i></button>
        <label title="Color" style="margin-right:0.5rem;">Color</label>
        <span id="color-picker"></span>
        <label title="Size">Size 
          <input type="range" id="sizePicker" min="2" max="40" value="${this.thickness}">
        </label>
      <select id="fontFamilyPicker" title="Font Family">
        <option value="Montserrat">Montserrat</option>
        <option value="Arial">Arial</option>
        <option value="Comic Sans MS">Comic Sans</option>
        <option value="Times New Roman">Times</option>
      </select>
        <label title="Font Size">Font Size 
          <input type="number" id="fontSizePicker" min="12" max="72" value="${this.fontSize}" style="width:60px;">
        </label>
        <button id="clearDrawingBtn" data-tippy-content="Clear"><i class="fa-solid fa-trash"></i></button>
        <button id="saveDrawingBtn" data-tippy-content="Save"><i class="fa-solid fa-floppy-disk"></i></button>
        <button id="printDrawingBtn" data-tippy-content="Print"><i class="fa-solid fa-print"></i></button>
        <button id="downloadDrawingBtn" data-tippy-content="Download"><i class="fa-solid fa-download"></i></button>
      `;
    this.attachToolbarEvents();
    if (this.pickr) { this.pickr.destroyAndRemove(); this.pickr = null; }
    this.pickr = Pickr.create({
      el: '#color-picker',
      theme: 'classic',
      default: this.color,
      swatches: [ '#23243a', '#6c63ff', '#ffd166', '#ff6f91', '#4f8cff', '#00b894', '#fff', '#000' ],
      components: { preview: true, opacity: true, hue: true, interaction: { hex: true, rgba: true, input: true, save: true } }
    });
    this.pickr.on('change', (color) => { this.color = color.toHEXA().toString(); this.updateBrush(); });
    tippy('[data-tippy-content]', { theme: 'light-border', animation: 'scale', delay: [0, 0] });
  }

  attachToolbarEvents() {
    const elements = {
      toolSelect: () => this.setTool('select'),
      toolBrush: () => this.setTool('brush'),
      toolEraser: () => this.setTool('eraser'),
      toolLine: () => this.setTool('line'),
      toolRect: () => this.setTool('rect'),
      toolEllipse: () => this.setTool('ellipse'),
      toolText: () => this.setTool('text'),
      brushTypePicker: (e) => { this.brushType = e.target.value; this.updateBrush(); },
      sizePicker: (e) => { this.thickness = parseInt(e.target.value); this.updateBrush(); },
      fontFamilyPicker: (e) => { this.font = e.target.value; },
      fontSizePicker: (e) => { this.fontSize = parseInt(e.target.value); },
      clearDrawingBtn: () => this.clearCanvas(),
      saveDrawingBtn: () => this.saveDrawing(),
      printDrawingBtn: () => this.printDrawing(),
      downloadDrawingBtn: () => this.downloadDrawing()
    };
    Object.entries(elements).forEach(([id, handler]) => {
      const element = document.getElementById(id);
      if (element) {
        element.onclick = handler;
        if (id === 'sizePicker' || id === 'fontFamilyPicker' || id === 'fontSizePicker' || id === 'brushTypePicker') {
          element.oninput = handler;
        }
      }
    });
  }

  setTool(t) {
    // Store previous color for eraser logic
    if (!this._prevColor) this._prevColor = this.color;
    if (this.tool === 'eraser' && t !== 'eraser') {
      // Restore previous color when leaving eraser
      this.color = this._prevColor;
      this.updateBrush();
    }
    // Remove previous eraser listeners if any
    if (this._eraserHandlers) {
      this.canvas.off('mouse:down', this._eraserHandlers.down);
      this.canvas.off('mouse:move', this._eraserHandlers.move);
      this.canvas.off('mouse:up', this._eraserHandlers.up);
      this._eraserHandlers = null;
    }
    const prevTool = this.tool;
    this.tool = t;
    this.textMode = (t === 'text');
    if (!this.canvas) return;
    this.canvas.isDrawingMode = false;
    this.canvas.selection = false;
    this.canvas.defaultCursor = 'default';
    this.canvas.forEachObject(obj => { obj.selectable = true; obj.evented = true; });
    this.canvas.off('mouse:down');
    this.canvas.off('mouse:move');
    this.canvas.off('mouse:up');
    if (t === 'brush') {
      this.canvas.forEachObject(obj => { obj.selectable = false; obj.evented = false; obj.hoverCursor = 'not-allowed'; });
      this.canvas.isDrawingMode = true;
      this.updateBrush();
      this.canvas.off('path:created:restore');
      this.canvas.on('path:created:restore', (e) => {
        this.canvas.forEachObject(obj => { obj.selectable = true; obj.evented = true; obj.hoverCursor = 'move'; });
      });
      this.canvas.off('path:created:patch');
      this.canvas.on('path:created:patch', (e) => {
        this.canvas.fire('path:created:restore', e);
      });
      this.canvas.off('path:created:patcher');
      this.canvas.on('path:created', (e) => {
        this.canvas.fire('path:created:patch', e);
      });
    } else if (t === 'eraser') {
      // Brush-style eraser that paints white over anything
      this.canvas.isDrawingMode = true;
      this.canvas.selection = false;
      this.canvas.defaultCursor = 'crosshair';
      this.canvas.forEachObject(obj => { obj.selectable = false; obj.evented = false; });
      
      // Store current color and set to white for erasing
      this._prevColor = this.color;
      this.color = '#ffffff';
      
      // Create a white brush for erasing
      const eraserBrush = new fabric.PencilBrush(this.canvas);
      eraserBrush.width = this.thickness;
      eraserBrush.color = '#ffffff';
      this.canvas.freeDrawingBrush = eraserBrush;
      
      // Add a white background to make erasing visible
      const bgColor = this.canvas.backgroundColor;
      if (bgColor !== '#ffffff') {
        this.canvas.setBackgroundColor('#ffffff', () => {
          this.canvas.renderAll();
        });
      }
    } else if (t === 'select') {
      this.canvas.isDrawingMode = false;
      this.canvas.selection = true;
      this.canvas.defaultCursor = 'move';
      this.canvas.forEachObject(obj => { obj.selectable = true; obj.evented = true; });
    } else if (t === 'text') {
      this.canvas.isDrawingMode = false;
      this.canvas.on('mouse:down', (opt) => this.addTextAtPointer(opt));
    } else if (t === 'line' || t === 'rect' || t === 'ellipse') {
      this.canvas.isDrawingMode = false;
      let isDown = false, origX = 0, origY = 0, shape = null;
      this.canvas.forEachObject(obj => { obj.selectable = false; obj.evented = false; obj.hoverCursor = 'not-allowed'; });
      this.canvas.on('mouse:down', (o) => {
        if (o.target) return;
        isDown = true;
        const pointer = this.canvas.getPointer(o.e);
        origX = pointer.x;
        origY = pointer.y;
        if (t === 'line') {
          shape = new fabric.Line([origX, origY, origX, origY], {
            stroke: this.color,
            strokeWidth: this.thickness,
            selectable: false
          });
        } else if (t === 'rect') {
          shape = new fabric.Rect({
            left: origX,
            top: origY,
            width: 0,
            height: 0,
            fill: 'rgba(0,0,0,0)',
            stroke: this.color,
            strokeWidth: this.thickness,
            selectable: false
          });
        } else if (t === 'ellipse') {
          shape = new fabric.Ellipse({
            left: origX,
            top: origY,
            rx: 0,
            ry: 0,
            fill: 'rgba(0,0,0,0)',
            stroke: this.color,
            strokeWidth: this.thickness,
            selectable: false
          });
        }
        this.canvas.add(shape);
      });
      this.canvas.on('mouse:move', (o) => {
        if (!isDown || !shape) return;
        const pointer = this.canvas.getPointer(o.e);
        if (t === 'line') {
          shape.set({ x2: pointer.x, y2: pointer.y });
        } else if (t === 'rect') {
          shape.set({ width: Math.abs(pointer.x - origX), height: Math.abs(pointer.y - origY) });
          shape.set({ left: Math.min(origX, pointer.x), top: Math.min(origY, pointer.y) });
        } else if (t === 'ellipse') {
          shape.set({ rx: Math.abs(pointer.x - origX) / 2, ry: Math.abs(pointer.y - origY) / 2 });
          shape.set({ left: Math.min(origX, pointer.x), top: Math.min(origY, pointer.y) });
        }
        this.canvas.renderAll();
      });
      this.canvas.on('mouse:up', () => {
        isDown = false;
        if (shape) shape.set({ selectable: true });
        shape = null;
        this.canvas.forEachObject(obj => { obj.selectable = true; obj.evented = true; obj.hoverCursor = 'move'; });
        this.canvas.discardActiveObject();
      });
    }
    // Only re-render toolbar if tool actually changed
    if (prevTool !== t) {
      this.renderToolbar();
    }
  }

  updateBrush() {
    if (!this.canvas || this.tool !== 'brush') return;
    let brush;
    switch (this.brushType) {
      case 'spray':
        brush = new fabric.SprayBrush(this.canvas);
        break;
      case 'pattern':
        brush = new fabric.PatternBrush(this.canvas);
        // Use a static canvas as the pattern source
        const patternCanvas = document.createElement('canvas');
        patternCanvas.width = patternCanvas.height = 20;
        const ctx = patternCanvas.getContext('2d');
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(10, 10, 5, 0, 2 * Math.PI);
        ctx.fill();
        brush.source = patternCanvas;
        break;
      case 'marker':
        brush = new fabric.PencilBrush(this.canvas);
        brush.width = this.thickness * 2;
        break;
      default:
        brush = new fabric.PencilBrush(this.canvas);
    }
    brush.width = this.thickness;
    brush.color = this.color;
    this.canvas.freeDrawingBrush = brush;
    this.activeBrush = brush;
  }

  pushUndo() {
    this.undoStack.push(this.canvas.toDatalessJSON());
    if (this.undoStack.length > 30) this.undoStack.shift();
    this.redoStack = [];
    this.updateUndoRedoButtons();
  }

  undo() {
    if (this.undoStack.length > 1) {
      this.redoStack.push(this.canvas.toDatalessJSON());
      const prev = this.undoStack.pop();
      this.canvas.loadFromJSON(prev, () => {
        this.canvas.renderAll();
        this.updateUndoRedoButtons();
      });
    }
  }

  redo() {
    if (this.redoStack.length > 0) {
      this.undoStack.push(this.canvas.toDatalessJSON());
      const next = this.redoStack.pop();
      this.canvas.loadFromJSON(next, () => {
        this.canvas.renderAll();
        this.updateUndoRedoButtons();
      });
    }
  }

  updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    if (undoBtn) undoBtn.disabled = this.undoStack.length <= 1;
    if (redoBtn) redoBtn.disabled = this.redoStack.length === 0;
  }

  addTextAtPointer(opt) {
    const pointer = this.canvas.getPointer(opt.e);
    const text = new fabric.IText('Edit me', {
      left: pointer.x,
      top: pointer.y,
      fill: this.color,
      fontFamily: this.font,
      fontSize: this.fontSize,
      opacity: 1
    });
    this.canvas.add(text);
    this.canvas.setActiveObject(text);
    text.enterEditing();
    this.textMode = false;
    this.setTool('brush');
  }

  clearCanvas() {
    this.canvas.clear();
    this.canvas.setBackgroundColor('#fff', this.canvas.renderAll.bind(this.canvas));
    this.pushUndo();
    this.updateUndoRedoButtons();
  }

  resizeCanvasResponsive() {
    if (!this.canvas) return;
    const el = document.getElementById('drawingCanvas');
    if (!el) return;
    let width = 1100, height = 600;
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    if (vw < 1200) {
      width = Math.floor(vw * 0.9);
      height = Math.floor(width * 0.55);
    }
    if (vw < 700) {
      width = Math.floor(vw * 0.98);
      height = Math.floor(width * 0.6);
    }
    // Save canvas state
    const json = this.canvas.toDatalessJSON();
    el.width = width;
    el.height = height;
    el.style.width = width + 'px';
    el.style.height = height + 'px';
    this.canvas.setWidth(width);
    this.canvas.setHeight(height);
    // Restore canvas state
    this.canvas.loadFromJSON(json, () => this.canvas.renderAll());
  }

  printDrawing() {
    const dataUrl = this.canvas.toDataURL({ format: 'png' });
    const win = window.open('');
    const img = new window.Image();
    img.src = dataUrl;
    img.onload = function() {
      win.document.body.innerHTML = '';
      win.document.body.appendChild(img);
      win.print();
      win.close();
    };
  }

  downloadDrawing() {
    const dataUrl = this.canvas.toDataURL({ format: 'png' });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'drawing.png';
    a.click();
  }

  async saveDrawing() {
    const dataUrl = this.canvas.toDataURL({ format: 'png' });
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Login required');
      return;
    }
    try {
      const res = await fetch('https://safespace-2x5n.onrender.com/drawings', {
        
        credentials: 'include',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ image: dataUrl })
      });
      if (res.ok) {
        if (typeof loadDrawings === 'function') loadDrawings();
        alert('Drawing saved!');
      } else {
        const err = await res.text();
        console.error('Save failed:', err);
        alert('Failed to save drawing');
      }
    } catch (error) {
      console.error('Error saving drawing:', error);
      alert('Failed to save drawing, cannot save more than 3 drawings.');
    }
  }

  dispose() {
    if (this.canvas) {
      this.canvas.dispose();
    }
    window.removeEventListener('resize', this.boundResizeHandler);
    this.isInitialized = false;
  }
}

// Create a single instance
const drawingPad = new DrawingPad();

// Export functions for global use
window.initDrawingPad = () => drawingPad.init();
window.closeDrawingPadModal = () => drawingPad.dispose();
window.openDrawingPadModal = () => {
  drawingPad.dispose();
  setTimeout(() => drawingPad.init(), 100);
};

// Initialize if canvas exists on page load
if (document.getElementById('drawingCanvas')) {
  document.addEventListener('DOMContentLoaded', () => drawingPad.init());
} 