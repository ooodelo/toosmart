(function (global) {
  'use strict';

  var globalObject = global || (typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : this));
  var doc = globalObject && globalObject.document ? globalObject.document : null;
  var docElement = doc ? doc.documentElement : null;

  var BREAKPOINTS = {
    MOBILE_MAX: 767,
    TABLET_MAX: 899,
    DESKTOP_MAX: 1279,
  };

  function isNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }

  function getMatchMediaResult(win, query) {
    if (!win || typeof win.matchMedia !== 'function') {
      return false;
    }
    try {
      return win.matchMedia(query).matches;
    } catch (error) {
      return false;
    }
  }

  function detectInputType(win) {
    var host = win || globalObject;
    var hasCoarsePointer = getMatchMediaResult(host, '(any-pointer: coarse)');
    var navigatorObject = host && host.navigator ? host.navigator : null;
    var maxTouchPoints = navigatorObject && typeof navigatorObject.maxTouchPoints === 'number'
      ? navigatorObject.maxTouchPoints
      : 0;
    var hasTouchPoints = maxTouchPoints > 0;

    return hasCoarsePointer || hasTouchPoints ? 'touch' : 'pointer';
  }

  function classifyMode(width, inputType) {
    var isTouchDevice = inputType === 'touch';

    if (isTouchDevice) {
      if (width < 768) {
        return 'mobile';
      }
      if (width < 900) {
        return 'tablet';
      }
      return 'desktop';
    }

    if (width < 768) {
      return 'mobile';
    }
    if (width < 900) {
      return 'tablet';
    }
    if (width < 1280) {
      return 'desktop';
    }
    return 'desktop-wide';
  }

  function collectWidthSources(win, element) {
    var host = win || globalObject;
    var el = element || docElement;

    return [
      {
        source: 'visualViewportWidth',
        value:
          host && host.visualViewport && isNumber(host.visualViewport.width) && host.visualViewport.width > 0
            ? host.visualViewport.width
            : null,
      },
      {
        source: 'rootClientWidth',
        value: el && isNumber(el.clientWidth) && el.clientWidth > 0 ? el.clientWidth : null,
      },
      {
        source: 'innerWidth',
        value: host && isNumber(host.innerWidth) && host.innerWidth > 0 ? host.innerWidth : null,
      },
      {
        source: 'outerWidth',
        value: host && isNumber(host.outerWidth) && host.outerWidth > 0 ? host.outerWidth : null,
      },
      {
        source: 'screenWidth',
        value: host && host.screen && isNumber(host.screen.width) && host.screen.width > 0 ? host.screen.width : null,
      },
    ];
  }

  function detectModeInternal(win, element, inputType) {
    var host = win || globalObject;
    var el = element || docElement;
    var sources = collectWidthSources(host, el);

    for (var i = 0; i < sources.length; i += 1) {
      var entry = sources[i];
      var value = entry ? entry.value : null;
      if (isNumber(value) && value > 0) {
        return classifyMode(value, inputType);
      }
    }

    var fallbackQueries = [
      ['mobile', '(max-width: 767px)'],
      ['tablet', '(min-width: 768px) and (max-width: 899px)'],
      ['desktop', '(min-width: 900px) and (max-width: 1279px)'],
      ['desktop-wide', '(min-width: 1280px)'],
    ];

    for (var j = 0; j < fallbackQueries.length; j += 1) {
      var pair = fallbackQueries[j];
      if (getMatchMediaResult(host, pair[1])) {
        return pair[0];
      }
    }

    return 'desktop';
  }

  function detectInitialState(win, docObject) {
    var host = win || globalObject;
    var documentObject = docObject || doc;
    var element = documentObject && documentObject.documentElement ? documentObject.documentElement : docElement;
    var width = null;

    if (host && isNumber(host.innerWidth) && host.innerWidth > 0) {
      width = host.innerWidth;
    } else if (element && isNumber(element.clientWidth) && element.clientWidth > 0) {
      width = element.clientWidth;
    }

    var inputType = detectInputType(host);
    var mode = 'desktop';

    if (isNumber(width) && width > 0) {
      mode = classifyMode(width, inputType);
    } else {
      mode = detectModeInternal(host, element, inputType);
    }

    return {
      mode: mode,
      input: inputType,
    };
  }

  function applyModeToBody(docObject, mode) {
    var documentObject = docObject || doc;
    if (!documentObject || !documentObject.body) {
      return false;
    }
    documentObject.body.dataset.mode = mode;
    return true;
  }

  function applyStateToBody(docObject, state) {
    var documentObject = docObject || doc;
    if (!documentObject || !documentObject.body || !state) {
      return false;
    }

    var bodyElement = documentObject.body;

    if (state.mode) {
      bodyElement.dataset.mode = state.mode;
    }

    if (state.input) {
      bodyElement.dataset.input = state.input;
    }

    return true;
  }

  var ModeUtils = {
    BREAKPOINTS: BREAKPOINTS,
    classifyMode: function (width, inputType) {
      return classifyMode(width, inputType);
    },
    detectInput: function (win) {
      return detectInputType(win || globalObject);
    },
    detectMode: function (win, element, inputType) {
      return detectModeInternal(win || globalObject, element || docElement, inputType);
    },
    getWidthSources: function (win, element) {
      return collectWidthSources(win || globalObject, element || docElement);
    },
    detectInitialState: function (win, docObject) {
      return detectInitialState(win || globalObject, docObject || doc);
    },
    applyModeToBody: function (docObject, mode) {
      return applyModeToBody(docObject || doc, mode);
    },
    applyStateToBody: function (docObject, state) {
      return applyStateToBody(docObject || doc, state);
    },
  };

  globalObject.ModeUtils = ModeUtils;
})(typeof window !== 'undefined' ? window : null);
