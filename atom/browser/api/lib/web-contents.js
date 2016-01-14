'use strict';

var EventEmitter, Menu, NavigationController, PDFPageSize, binding, deprecate, getNextId, ipcMain, nextId, ref, session, wrapWebContents,
  slice = [].slice;

EventEmitter = require('events').EventEmitter;

ref = require('electron'), deprecate = ref.deprecate, ipcMain = ref.ipcMain, session = ref.session, NavigationController = ref.NavigationController, Menu = ref.Menu;

binding = process.atomBinding('web_contents');

nextId = 0;

getNextId = function() {
  return ++nextId;
};

PDFPageSize = {
  A5: {
    custom_display_name: "A5",
    height_microns: 210000,
    name: "ISO_A5",
    width_microns: 148000
  },
  A4: {
    custom_display_name: "A4",
    height_microns: 297000,
    name: "ISO_A4",
    is_default: "true",
    width_microns: 210000
  },
  A3: {
    custom_display_name: "A3",
    height_microns: 420000,
    name: "ISO_A3",
    width_microns: 297000
  },
  Legal: {
    custom_display_name: "Legal",
    height_microns: 355600,
    name: "NA_LEGAL",
    width_microns: 215900
  },
  Letter: {
    custom_display_name: "Letter",
    height_microns: 279400,
    name: "NA_LETTER",
    width_microns: 215900
  },
  Tabloid: {
    height_microns: 431800,
    name: "NA_LEDGER",
    width_microns: 279400,
    custom_display_name: "Tabloid"
  }
};

// Following methods are mapped to webFrame.
const webFrameMethods = [
  'executeJavaScript',
  'insertText',
  'setZoomFactor',
  'setZoomLevel',
  'setZoomLevelLimits',
];

wrapWebContents = function(webContents) {

  // webContents is an EventEmitter.
  var controller, method, name, ref1;
  webContents.__proto__ = EventEmitter.prototype;

  // WebContents::send(channel, args..)
  webContents.send = function() {
    var args, channel;
    channel = arguments[0], args = 2 <= arguments.length ? slice.call(arguments, 1) : [];
    return this._send(channel, slice.call(args));
  };

  // The navigation controller.
  controller = new NavigationController(webContents);
  ref1 = NavigationController.prototype;
  for (name in ref1) {
    method = ref1[name];
    if (method instanceof Function) {
      (function(name, method) {
        return webContents[name] = function() {
          return method.apply(controller, arguments);
        };
      })(name, method);
    }
  }

  // Mapping webFrame methods.
  for (let method of webFrameMethods) {
    webContents[method] = function() {
      let args = Array.prototype.slice.call(arguments);
      this.send('ELECTRON_INTERNAL_RENDERER_WEB_FRAME_METHOD', method, args);
    };
  }

  // Make sure webContents.executeJavaScript would run the code only when the
  // webContents has been loaded.
  const executeJavaScript = webContents.executeJavaScript;
  webContents.executeJavaScript = function(code, hasUserGesture) {
    if (this.getURL() && !this.isLoading())
      return executeJavaScript.call(this, code, hasUserGesture);
    else
      return this.once('did-finish-load', executeJavaScript.bind(this, code, hasUserGesture));
  };

  // Dispatch IPC messages to the ipc module.
  webContents.on('ipc-message', function(event, packed) {
    var args, channel;
    channel = packed[0], args = 2 <= packed.length ? slice.call(packed, 1) : [];
    return ipcMain.emit.apply(ipcMain, [channel, event].concat(slice.call(args)));
  });
  webContents.on('ipc-message-sync', function(event, packed) {
    var args, channel;
    channel = packed[0], args = 2 <= packed.length ? slice.call(packed, 1) : [];
    Object.defineProperty(event, 'returnValue', {
      set: function(value) {
        return event.sendReply(JSON.stringify(value));
      }
    });
    return ipcMain.emit.apply(ipcMain, [channel, event].concat(slice.call(args)));
  });

  // Handle context menu action request from pepper plugin.
  webContents.on('pepper-context-menu', function(event, params) {
    var menu;
    menu = Menu.buildFromTemplate(params.menu);
    return menu.popup(params.x, params.y);
  });

  // This error occurs when host could not be found.
  webContents.on('did-fail-provisional-load', function() {
    var args;
    args = 1 <= arguments.length ? slice.call(arguments, 0) : [];

    // Calling loadURL during this event might cause crash, so delay the event
    // until next tick.
    return setImmediate((function(_this) {
      return function() {
        return _this.emit.apply(_this, ['did-fail-load'].concat(slice.call(args)));
      };
    })(this));
  });

  // Delays the page-title-updated event to next tick.
  webContents.on('-page-title-updated', function() {
    var args;
    args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
    return setImmediate((function(_this) {
      return function() {
        return _this.emit.apply(_this, ['page-title-updated'].concat(slice.call(args)));
      };
    })(this));
  });

  // Deprecated.
  deprecate.rename(webContents, 'loadUrl', 'loadURL');
  deprecate.rename(webContents, 'getUrl', 'getURL');
  deprecate.event(webContents, 'page-title-set', 'page-title-updated', function() {
    var args;
    args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
    return this.emit.apply(this, ['page-title-set'].concat(slice.call(args)));
  });
  return webContents.printToPDF = function(options, callback) {
    var printingSetting;
    printingSetting = {
      pageRage: [],
      mediaSize: {},
      landscape: false,
      color: 2,
      headerFooterEnabled: false,
      marginsType: 0,
      isFirstRequest: false,
      requestID: getNextId(),
      previewModifiable: true,
      printToPDF: true,
      printWithCloudPrint: false,
      printWithPrivet: false,
      printWithExtension: false,
      deviceName: "Save as PDF",
      generateDraftData: true,
      fitToPageEnabled: false,
      duplex: 0,
      copies: 1,
      collate: true,
      shouldPrintBackgrounds: false,
      shouldPrintSelectionOnly: false
    };
    if (options.landscape) {
      printingSetting.landscape = options.landscape;
    }
    if (options.marginsType) {
      printingSetting.marginsType = options.marginsType;
    }
    if (options.printSelectionOnly) {
      printingSetting.shouldPrintSelectionOnly = options.printSelectionOnly;
    }
    if (options.printBackground) {
      printingSetting.shouldPrintBackgrounds = options.printBackground;
    }
    if (options.pageSize && PDFPageSize[options.pageSize]) {
      printingSetting.mediaSize = PDFPageSize[options.pageSize];
    } else {
      printingSetting.mediaSize = PDFPageSize['A4'];
    }
    return this._printToPDF(printingSetting, callback);
  };
};

binding._setWrapWebContents(wrapWebContents);

module.exports.create = function(options) {
  if (options == null) {
    options = {};
  }
  return binding.create(options);
};
