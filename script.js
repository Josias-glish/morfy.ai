/* morfy — comportamiento de la landing.
   Cada módulo corre aislado: si uno falla, los demás siguen y el contenido queda visible.
   GSAP/ScrollTrigger y Three.js son mejoras; sin ellos la página está completa. */
(function () {
  "use strict";

  var root = document.documentElement;
  window.morfyBooted = true;

  var THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js";
  var debug = /[?&]debug\b/.test(window.location.search) ? (window.morfyDebug = {}) : null;
  var hasIO = "IntersectionObserver" in window;

  var mqReduce = media("(prefers-reduced-motion: reduce)");
  var mqFine = media("(hover: hover) and (pointer: fine)");
  var mqTablet = media("(min-width: 768px)");

  function media(query) {
    return window.matchMedia ? window.matchMedia(query) : { matches: false };
  }

  function onMediaChange(mq, fn) {
    if (mq.addEventListener) mq.addEventListener("change", fn);
    else if (mq.addListener) mq.addListener(fn);
  }

  function $$(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function debounce(fn, wait) {
    var timer = 0;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, wait);
    };
  }

  function rafThrottle(fn) {
    var frame = 0;
    return function () {
      if (frame) return;
      frame = requestAnimationFrame(function () {
        frame = 0;
        fn();
      });
    };
  }

  function cssMs(name) {
    var value = getComputedStyle(root).getPropertyValue(name).trim();
    var number = parseFloat(value) || 0;
    return /ms$/.test(value) ? number : number * 1000;
  }

  function cssValue(name) {
    return getComputedStyle(root).getPropertyValue(name).trim();
  }

  function safely(name, fn, critical) {
    try {
      fn();
    } catch (error) {
      if (critical) root.classList.remove("js");
      if (window.console) window.console.warn("[morfy] " + name, error);
    }
  }

  /* Titular: recalcula las líneas cuando carga la fuente o cambia el ancho, sin reanimar */
  safely("titular", function () {
    if (!window.morfySplitTitle) return;
    var readyAt = window.performance.now() + 1100;
    var width = window.innerWidth;
    var resplit = function () {
      var wait = readyAt - window.performance.now();
      if (wait > 0) {
        setTimeout(resplit, wait);
        return;
      }
      window.morfySplitTitle();
    };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(resplit);
    window.addEventListener("resize", debounce(function () {
      if (window.innerWidth === width) return;
      width = window.innerWidth;
      resplit();
    }, 150));
  });

  /* Entradas al hacer scroll: una sola vez, escalonadas dentro de cada grupo */
  safely("revelado", function () {
    $$("[data-reveal-group]").forEach(function (group) {
      $$("[data-reveal]", group).forEach(function (item, i) {
        item.style.setProperty("--i", i);
      });
    });
    var items = $$("[data-reveal]");
    if (!hasIO) {
      items.forEach(function (item) {
        item.classList.add("is-in");
      });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0 });
    items.forEach(function (item) {
      observer.observe(item);
    });
  }, true);

  /* Un solo botón primario por pantalla: barra inferior (celular) y CTA del encabezado (desde 768 px) */
  safely("cta", function () {
    var bar = document.querySelector("[data-sticky-cta]");
    var headerCta = document.querySelector("[data-cta-header]");
    var header = document.querySelector("[data-header]");
    var hero = document.querySelector("[data-hero]");
    var contact = document.querySelector("[data-contact]");

    if (header) {
      var markScrolled = rafThrottle(function () {
        header.dataset.scrolled = String(window.scrollY > 8);
      });
      window.addEventListener("scroll", markScrolled, { passive: true });
      markScrolled();
    }

    if (!hasIO || !hero || !contact) return;

    var primaries = $$(".btn--primary").filter(function (button) {
      return !button.closest("[data-sticky-cta], [data-header]");
    });
    var visible = [];
    var heroPassed = false;
    var contactReached = false;

    var show = function (el, on) {
      if (el && el.dataset.visible !== String(on)) el.dataset.visible = String(on);
    };
    var update = function () {
      var noPrimary = visible.length === 0;
      show(bar, !mqTablet.matches && heroPassed && !contactReached && noPrimary);
      show(headerCta, mqTablet.matches && noPrimary);
    };

    /* Desde 768 px el encabezado es sticky: lo que queda debajo de él no cuenta como visible */
    var buttonsObserver = null;
    var watchButtons = function () {
      if (buttonsObserver) buttonsObserver.disconnect();
      visible = [];
      var covered = mqTablet.matches && header ? header.offsetHeight : 0;
      buttonsObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var index = visible.indexOf(entry.target);
          if (entry.isIntersecting && index === -1) visible.push(entry.target);
          if (!entry.isIntersecting && index > -1) visible.splice(index, 1);
        });
        update();
      }, { rootMargin: -covered + "px 0px 0px 0px" });
      primaries.forEach(function (button) {
        buttonsObserver.observe(button);
      });
    };
    watchButtons();

    var sectionsObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.target === hero) heroPassed = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        if (entry.target === contact) contactReached = entry.isIntersecting || entry.boundingClientRect.top < 0;
      });
      update();
    });
    sectionsObserver.observe(hero);
    sectionsObserver.observe(contact);
    onMediaChange(mqTablet, function () {
      watchButtons();
      update();
    });
  });

  /* Preguntas frecuentes: acordeón accesible, una abierta a la vez */
  safely("acordeon", function () {
    var list = document.querySelector("[data-accordion]");
    if (!list) return;
    var triggers = $$(".faq__trigger", list);
    var panels = triggers.map(function (trigger) {
      return document.getElementById(trigger.getAttribute("aria-controls"));
    });

    var set = function (index, open, animate) {
      var trigger = triggers[index];
      var panel = panels[index];
      var wasOpen = !panel.hidden;
      trigger.setAttribute("aria-expanded", String(open));
      if (panel.morfyAnimation) panel.morfyAnimation.cancel();
      if (wasOpen === open) return;

      if (!animate || !panel.animate) {
        panel.hidden = !open;
        return;
      }
      if (mqReduce.matches) {
        panel.hidden = !open;
        if (open) panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: cssMs("--motion-micro"), easing: "linear" });
        return;
      }
      var from = open ? 0 : panel.getBoundingClientRect().height;
      panel.hidden = false;
      var to = open ? panel.scrollHeight : 0;
      var animation = panel.animate([{ height: from + "px" }, { height: to + "px" }], {
        duration: cssMs("--motion-component"),
        easing: cssValue("--ease-move")
      });
      panel.morfyAnimation = animation;
      animation.onfinish = function () {
        panel.morfyAnimation = null;
        if (!open) panel.hidden = true;
      };
    };

    triggers.forEach(function (trigger, index) {
      set(index, index === 0, false);
      trigger.addEventListener("click", function () {
        var open = trigger.getAttribute("aria-expanded") !== "true";
        if (open) {
          triggers.forEach(function (other, otherIndex) {
            if (otherIndex !== index) set(otherIndex, false, true);
          });
        }
        set(index, open, true);
      });
      trigger.addEventListener("keydown", function (event) {
        var target = null;
        if (event.key === "ArrowDown") target = triggers[(index + 1) % triggers.length];
        if (event.key === "ArrowUp") target = triggers[(index - 1 + triggers.length) % triggers.length];
        if (event.key === "Home") target = triggers[0];
        if (event.key === "End") target = triggers[triggers.length - 1];
        if (!target) return;
        event.preventDefault();
        target.focus();
      });
    });
  });

  /* Comparador de planes (celular): tabla desplazable con desvanecidos laterales */
  safely("comparador", function () {
    var box = document.querySelector("[data-compare]");
    if (!box) return;
    var toggle = box.querySelector("[data-compare-toggle]");
    var label = box.querySelector("[data-compare-label]");
    var panel = document.getElementById(toggle.getAttribute("aria-controls"));
    var frame = box.querySelector("[data-compare-frame]");
    var scroller = box.querySelector("[data-compare-scroll]");

    var shadows = function () {
      var max = scroller.scrollWidth - scroller.clientWidth;
      frame.dataset.start = String(scroller.scrollLeft <= 1);
      frame.dataset.end = String(scroller.scrollLeft >= max - 1);
    };
    var set = function (open) {
      toggle.setAttribute("aria-expanded", String(open));
      panel.hidden = !open;
      label.textContent = open ? "Ocultar comparación" : "Comparar planes";
      if (open) shadows();
      if (window.ScrollTrigger) window.ScrollTrigger.refresh();
    };

    set(false);
    toggle.addEventListener("click", function () {
      set(toggle.getAttribute("aria-expanded") !== "true");
    });
    scroller.addEventListener("scroll", rafThrottle(shadows), { passive: true });
    window.addEventListener("resize", debounce(shadows, 150));
  });

  /* Tarjetas: inclinación máxima de 6° y brillo que sigue al puntero (solo con puntero fino) */
  safely("inclinacion", function () {
    if (!mqFine.matches || mqReduce.matches) return;
    var MAX = 6;
    $$("[data-tilt]").forEach(function (card) {
      var layer = document.createElement("span");
      var glow = document.createElement("span");
      layer.className = "card__glow-layer";
      layer.setAttribute("aria-hidden", "true");
      glow.className = "card__glow";
      layer.appendChild(glow);
      card.insertBefore(layer, card.firstChild);

      var frame = 0;
      var rect = null;
      var px = 0.5;
      var py = 0.5;
      var apply = function () {
        frame = 0;
        if (!rect) return;
        var rotateX = (0.5 - py) * 2 * MAX;
        var rotateY = (px - 0.5) * 2 * MAX;
        card.style.transform = "perspective(900px) rotateX(" + rotateX.toFixed(2) + "deg) rotateY(" + rotateY.toFixed(2) + "deg)";
        glow.style.transform = "translate(" + (px * rect.width).toFixed(1) + "px, " + (py * rect.height).toFixed(1) + "px)";
      };

      card.addEventListener("pointerenter", function (event) {
        if (event.pointerType !== "mouse") return;
        rect = card.getBoundingClientRect();
        card.classList.add("is-hover");
      });
      card.addEventListener("pointermove", function (event) {
        if (event.pointerType !== "mouse") return;
        rect = rect || card.getBoundingClientRect();
        px = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        py = clamp((event.clientY - rect.top) / rect.height, 0, 1);
        if (!frame) frame = requestAnimationFrame(apply);
      });
      card.addEventListener("pointerleave", function () {
        cancelAnimationFrame(frame);
        frame = 0;
        rect = null;
        card.classList.remove("is-hover");
        card.style.transform = "";
      });
    });
  });

  /* Lo que depende de GSAP arranca cuando ya corrieron todos los scripts diferidos */
  document.addEventListener("DOMContentLoaded", function () {
    safely("pasos", initSteps);
    safely("parallax", initParallax);
  });

  /* Cómo trabajamos: la línea se dibuja con el scroll y cada nodo se enciende al alcanzarlo */
  function initSteps() {
    var steps = document.querySelector("[data-steps]");
    if (!steps) return;
    var items = $$("[data-step]", steps);
    var line = steps.querySelector(".steps__line");
    var progress = steps.querySelector(".steps__progress");
    var stops = [];

    var measure = function () {
      var nodes = items.map(function (item) {
        var node = item.querySelector(".step__node");
        return item.offsetTop + node.offsetTop + node.offsetHeight / 2;
      });
      var first = nodes[0];
      var length = nodes[nodes.length - 1] - first;
      line.style.top = first + "px";
      steps.style.setProperty("--steps-line-length", length + "px");
      stops = nodes.map(function (y) {
        return length > 0 ? (y - first) / length : 0;
      });
    };
    measure();
    window.addEventListener("resize", debounce(measure, 150));

    var light = function (amount) {
      items.forEach(function (item, i) {
        item.classList.toggle("is-lit", amount > 0.001 && amount >= stops[i] - 0.001);
      });
    };

    var gsap = window.gsap;
    var ScrollTrigger = window.ScrollTrigger;
    if (gsap && ScrollTrigger && !mqReduce.matches) {
      gsap.registerPlugin(ScrollTrigger);
      steps.dataset.mode = "scrub";
      gsap.fromTo(progress, { strokeDashoffset: 1 }, {
        strokeDashoffset: 0,
        ease: "none",
        scrollTrigger: {
          trigger: steps,
          start: "top 75%",
          end: "bottom 60%",
          scrub: 0.5,
          onRefresh: function (self) {
            measure();
            light(self.progress);
          },
          onUpdate: function (self) {
            light(self.progress);
          }
        }
      });
      if (debug) debug.steps = "scrub";
      return;
    }

    /* Sin GSAP o con movimiento reducido: línea completa y nodos que se encienden al entrar */
    if (debug) debug.steps = "observer";
    if (!hasIO) {
      light(1);
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-lit");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -35% 0px" });
    items.forEach(function (item) {
      observer.observe(item);
    });
  }

  /* Retícula del hero: parallax en tres capas (4, 8 y 12 px como máximo), solo con puntero fino */
  function initParallax() {
    var gsap = window.gsap;
    var hero = document.querySelector("[data-hero]");
    if (!gsap || !hero || !mqFine.matches || mqReduce.matches) return;
    var heroVisible = true;
    var movers = $$("[data-parallax]", hero).map(function (layer) {
      return {
        max: parseFloat(layer.getAttribute("data-parallax")) || 0,
        x: gsap.quickTo(layer, "x", { duration: 0.8, ease: "power4.out" }),
        y: gsap.quickTo(layer, "y", { duration: 0.8, ease: "power4.out" })
      };
    });
    if (hasIO) {
      new IntersectionObserver(function (entries) {
        heroVisible = entries[entries.length - 1].isIntersecting;
      }).observe(hero);
    }
    window.addEventListener("pointermove", function (event) {
      if (!heroVisible || event.pointerType !== "mouse") return;
      var nx = clamp(event.clientX / window.innerWidth, 0, 1) - 0.5;
      var ny = clamp(event.clientY / window.innerHeight, 0, 1) - 0.5;
      movers.forEach(function (mover) {
        mover.x(nx * 2 * mover.max);
        mover.y(ny * 2 * mover.max);
      });
    }, { passive: true });
    if (debug) debug.parallax = movers.map(function (mover) { return mover.max; });
  }

  /* Hero 3D: nodos conectados en wireframe. Mismo dibujo que el SVG estático del HTML (cuadro t = 0). */
  safely("red", function () {
    var host = document.querySelector("[data-net]");
    if (!host) return;

    var NODES = [[-1, -1, -1], [-1, -1, 0], [-1, -1, 1], [-1, 0, -1], [-1, 0, 0], [-1, 0, 1], [-1, 1, -1], [-1, 1, 0], [0, -1, -1], [0, -1, 0], [0, -1, 1], [0, 0, -1], [0, 0, 0], [0, 0, 1], [0, 1, -1], [0, 1, 0], [0, 1, 1], [1, -1, 0], [1, -1, 1], [1, 0, -1], [1, 0, 0], [1, 0, 1], [1, 1, -1], [1, 1, 0], [1, 1, 1], [-1.9, 0.5, -0.4], [1.9, -0.5, 0.4], [0.3, 1.85, -0.8], [-0.3, -1.85, 0.8], [-1, -0.35, 1.8], [1, 0.35, -1.8]];
    var EDGES = [[0, 1], [0, 3], [0, 8], [1, 2], [1, 4], [1, 9], [2, 5], [2, 10], [3, 4], [3, 6], [3, 11], [4, 5], [4, 7], [4, 12], [5, 13], [6, 7], [6, 14], [7, 15], [8, 9], [8, 11], [9, 10], [9, 12], [9, 17], [10, 13], [10, 18], [11, 12], [11, 14], [11, 19], [12, 13], [12, 15], [12, 20], [13, 16], [13, 21], [14, 15], [14, 22], [15, 16], [15, 23], [16, 24], [17, 18], [17, 20], [18, 21], [19, 20], [19, 22], [20, 21], [20, 23], [21, 24], [22, 23], [23, 24], [5, 16], [5, 7], [7, 16], [8, 19], [17, 19], [8, 17], [4, 25], [7, 25], [17, 26], [20, 26], [14, 27], [22, 27], [10, 28], [2, 28], [5, 29], [2, 29], [19, 30], [22, 30]];
    var ACCENT = [5, 13, 12, 11, 19];
    var VIEW = 600;
    var CAMERA = { fov: 35, z: 8 };
    var POSE = { x: 0.42, y: -0.62 };
    var FOG = { near: 6.6, far: 12 };
    var OPACITY = { edge: 0.34, node: 0.9 };
    var SIZE = 6;
    var SPIN = 0.12;
    var POINTER = { x: 0.12, y: 0.18 };
    var SCROLL_TILT = 0.25;
    var START_DELAY = 2500;
    var idle = window.requestIdleCallback
      ? function (fn, options) { return window.requestIdleCallback(fn, options); }
      : function (fn) { return setTimeout(fn, 200); };

    var stats = { state: "idle", reasons: [], dpr: 0, vertices: 0, frames: 0, fpsCap: 0, builds: 0, disposals: 0 };
    if (debug) debug.net = stats;
    var setState = function (state) {
      stats.state = state;
      host.dataset.state = state;
    };

    var connection = navigator.connection || {};
    if (mqReduce.matches) stats.reasons.push("reduced-motion");
    if (connection.saveData) stats.reasons.push("save-data");
    if (!(navigator.hardwareConcurrency > 4)) stats.reasons.push("low-power");
    if (!hasIO) stats.reasons.push("no-intersection-observer");
    if (!stats.reasons.length && !hasWebGL()) stats.reasons.push("no-webgl");
    if (stats.reasons.length) {
      setState("static");
      return;
    }

    var THREE = null;
    var scene = null;
    var visible = false;
    var loading = false;

    var start = function () {
      if (scene || loading) return;
      if (THREE) {
        scene = build();
        return;
      }
      loading = true;
      setState("loading");
      import(THREE_URL).then(function (module) {
        THREE = module;
        /* Un respiro entre evaluar el módulo y crear el contexto WebGL */
        idle(function () {
          loading = false;
          if (visible && !scene && !mqReduce.matches) scene = build();
          else setState("paused");
        }, { timeout: 1000 });
      }).catch(function (error) {
        loading = false;
        setState("error");
        if (window.console) window.console.warn("[morfy] three.js no cargó; queda el SVG estático", error);
      });
    };

    var stop = function () {
      if (!scene) return;
      scene.dispose();
      scene = null;
      setState("paused");
    };

    var observer = new IntersectionObserver(function (entries) {
      visible = entries[entries.length - 1].isIntersecting;
      if (visible) start();
      else stop();
    });

    onMediaChange(mqReduce, function () {
      if (!mqReduce.matches) return;
      observer.disconnect();
      stop();
      setState("static");
    });

    window.addEventListener("pagehide", stop);

    /* Carga diferida: después del primer render y de la carga, con el hilo principal libre.
       Mientras tanto se ve el SVG estático, que es el mismo cuadro con el que arranca el 3D. */
    var whenIdle = function () {
      setTimeout(function () {
        idle(function () {
          observer.observe(host);
        }, { timeout: 2000 });
      }, START_DELAY);
    };
    if (document.readyState === "complete") whenIdle();
    else window.addEventListener("load", whenIdle, { once: true });

    function hasWebGL() {
      try {
        var canvas = document.createElement("canvas");
        var gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
        var lose = gl && gl.getExtension("WEBGL_lose_context");
        if (lose) lose.loseContext();
        return !!gl;
      } catch {
        return false;
      }
    }

    function build() {
      var small = !mqTablet.matches || !mqFine.matches;
      var color = function (name) {
        return new THREE.Color(cssValue(name));
      };
      var background = color("--color-bg");

      var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
      renderer.setClearColor(background, 0);
      var canvas = renderer.domElement;
      canvas.className = "net__canvas";

      var world = new THREE.Scene();
      world.fog = new THREE.Fog(background, FOG.near, FOG.far);
      var camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 50);
      camera.position.set(0, 0, CAMERA.z);
      camera.lookAt(0, 0, 0);
      var group = new THREE.Group();
      group.rotation.set(POSE.x, POSE.y, 0);
      world.add(group);

      var edgePositions = new Float32Array(EDGES.length * 6);
      EDGES.forEach(function (edge, i) {
        edgePositions.set(NODES[edge[0]].concat(NODES[edge[1]]), i * 6);
      });
      var nodePositions = [];
      var accentPositions = [];
      NODES.forEach(function (node, i) {
        (ACCENT.indexOf(i) > -1 ? accentPositions : nodePositions).push(node[0], node[1], node[2]);
      });

      var geometry = function (positions) {
        var g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(positions instanceof Float32Array ? positions : new Float32Array(positions), 3));
        return g;
      };
      var edgeGeometry = geometry(edgePositions);
      var nodeGeometry = geometry(nodePositions);
      var accentGeometry = geometry(accentPositions);
      var edgeMaterial = new THREE.LineBasicMaterial({ color: color("--net-edge"), transparent: true, opacity: OPACITY.edge, depthWrite: false });
      var nodeMaterial = new THREE.PointsMaterial({ color: color("--net-node"), size: SIZE, sizeAttenuation: false, transparent: true, opacity: OPACITY.node, depthWrite: false });
      var accentMaterial = new THREE.PointsMaterial({ color: color("--net-accent"), size: SIZE * 1.5, sizeAttenuation: false, fog: false, depthWrite: false });
      group.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));
      group.add(new THREE.Points(nodeGeometry, nodeMaterial));
      group.add(new THREE.Points(accentGeometry, accentMaterial));

      var resize = function () {
        var width = host.clientWidth || 1;
        var height = host.clientHeight || 1;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        var scale = width / VIEW;
        nodeMaterial.size = SIZE * scale;
        accentMaterial.size = SIZE * 1.5 * scale;
      };
      resize();
      var resizeObserver = "ResizeObserver" in window ? new ResizeObserver(resize) : null;
      if (resizeObserver) resizeObserver.observe(host);
      else window.addEventListener("resize", resize);

      var target = { x: 0, y: 0, tilt: 0 };
      var current = { x: 0, y: 0, tilt: 0 };
      var onPointer = function (event) {
        if (event.pointerType !== "mouse") return;
        target.y = (clamp(event.clientX / window.innerWidth, 0, 1) - 0.5) * 2 * POINTER.y;
        target.x = (clamp(event.clientY / window.innerHeight, 0, 1) - 0.5) * 2 * POINTER.x;
      };
      var onScroll = function () {
        var hero = host.closest("section") || host;
        target.tilt = clamp(window.scrollY / (hero.offsetHeight || 1), 0, 1) * SCROLL_TILT;
      };
      if (mqFine.matches) window.addEventListener("pointermove", onPointer, { passive: true });
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();

      var minDelta = 1000 / (small ? 30 : 60) - 1;
      var last = -1;
      var spin = 0;
      var rendered = 0;
      var disposed = false;
      var loop = function (time) {
        if (last >= 0 && time - last < minDelta) return;
        var dt = last < 0 ? 0 : Math.min((time - last) / 1000, 0.1);
        last = time;
        spin += dt * SPIN;
        var ease = Math.min(1, dt * 3);
        current.x += (target.x - current.x) * ease;
        current.y += (target.y - current.y) * ease;
        current.tilt += (target.tilt - current.tilt) * ease;
        group.rotation.set(POSE.x + current.x + current.tilt, POSE.y + spin + current.y, 0);
        renderer.render(world, camera);
        stats.frames += 1;
        rendered += 1;
        if (rendered === 1) {
          host.appendChild(canvas);
          requestAnimationFrame(function () {
            host.classList.add("is-live");
          });
          setState("live");
        }
      };
      /* Los sombreadores se compilan en un turno libre; el primer cuadro ya no los paga */
      idle(function () {
        if (disposed) return;
        renderer.compile(world, camera);
        renderer.setAnimationLoop(loop);
      }, { timeout: 1000 });

      stats.builds += 1;
      stats.dpr = renderer.getPixelRatio();
      stats.fpsCap = small ? 30 : 60;
      stats.vertices = edgeGeometry.attributes.position.count + nodeGeometry.attributes.position.count + accentGeometry.attributes.position.count;
      /* Solo con ?debug: posiciones proyectadas del cuadro t = 0, para compararlas con el SVG estático */
      if (debug) {
        var projected = [];
        camera.updateMatrixWorld();
        group.updateMatrixWorld();
        NODES.forEach(function (node) {
          var v = new THREE.Vector3(node[0], node[1], node[2]).applyMatrix4(group.matrixWorld).project(camera);
          projected.push([Math.round(((v.x + 1) / 2) * VIEW * 100) / 100, Math.round(((1 - v.y) / 2) * VIEW * 100) / 100]);
        });
        stats.projected = projected;
      }

      return {
        dispose: function () {
          disposed = true;
          renderer.setAnimationLoop(null);
          if (resizeObserver) resizeObserver.disconnect();
          else window.removeEventListener("resize", resize);
          window.removeEventListener("pointermove", onPointer);
          window.removeEventListener("scroll", onScroll);
          [edgeGeometry, nodeGeometry, accentGeometry].forEach(function (g) { g.dispose(); });
          [edgeMaterial, nodeMaterial, accentMaterial].forEach(function (m) { m.dispose(); });
          renderer.dispose();
          renderer.forceContextLoss();
          host.classList.remove("is-live");
          if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
          stats.disposals += 1;
        }
      };
    }
  });
})();
