var _useless = function() {
  function add(parent, tag) {
    var el = document.createElement(tag);
    parent.appendChild(el);
    return el;
  }

  function addRow(table, colnum) {
    var res = [add(table, "tr")];
    for (var i = 0; i < colnum; i++) {
      res.push(add(res[0], "td"));
    }
    return res;
  }

  function Drawing(objs) {
    this.objs = objs;
    var padding = 2;
    var bx1 = null, by1 = null, bx2 = null, by2 = null;
    for (var i = 0; i < this.objs.length; i++) {
      var obj = this.objs[i];
      var lx, ly, hx, hy;
      if (obj.shape == 'circle') {
        lx = obj.x - obj.r;
        ly = obj.y - obj.r;
        hx = obj.x + obj.r;
        hy = obj.y + obj.r;
      } else if (obj.shape == 'arrow') {
        lx = Math.min(obj.x1, obj.x2);
        ly = Math.min(obj.y1, obj.y2);
        hx = Math.max(obj.x1, obj.x2);
        hy = Math.max(obj.y1, obj.y2);
      } else {
        continue;
      }
      lx -= padding;
      ly -= padding;
      hx += padding;
      hy += padding;
      if (bx1 == null) {
        bx1 = lx;
      }
      if (by1 == null) {
        by1 = ly;
      }
      if (bx2 == null) {
        bx2 = hx;
      }
      if (by2 == null) {
        by2 = hy;
      }
      bx1 = Math.min(bx1, lx);
      by1 = Math.min(by1, ly);
      bx2 = Math.max(bx2, hx);
      by2 = Math.max(by2, hy);
    }
    this.offX = -bx1;
    this.offY = -by1;
    this.width = bx2 - bx1;
    this.height = by2 - by1;
  }

  Drawing.prototype = {
    draw: function(canvas) {
      canvas.width = this.width;
      canvas.height = this.height;
      var ctx = canvas.getContext("2d");

      function circle(x, y, r) {
        ctx.beginPath();
        ctx.ellipse(x, y, r, r, 0, 0, 2 * Math.PI);
        ctx.stroke();
      }

      var arrowShape = [
        [ 0, 0 ],
        [ -12, -4 ],
        [ -12, 4]
      ];

      function drawFilledPolygon(shape) {
        ctx.beginPath();
        ctx.moveTo(shape[0][0],shape[0][1]);

        for (p in shape) {
          if (p > 0) {
            ctx.lineTo(shape[p][0],shape[p][1]);
          }
        }

        ctx.lineTo(shape[0][0],shape[0][1]);
        ctx.fill();
      };

      function arrow(x1, y1, x2, y2) {
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.save();
        ctx.translate(x2, y2);
        ctx.rotate(Math.atan2(y2 - y1, x2 - x1));
        drawFilledPolygon(arrowShape);
        ctx.restore();
      }

      function text(x, y, size, text) {
        ctx.save();
        ctx.font = size + "px serif";
        ctx.textBaseline = "middle";
        var msr = ctx.measureText(text);
        var dx = msr.width / 2;
        ctx.fillText(text, x - dx, y);
        ctx.restore();
      }

      ctx.translate(this.offX, this.offY);
      for (var i = 0; i < this.objs.length; i++) {
        var obj = this.objs[i];
        if (obj.shape == 'circle') {
          circle(obj.x, obj.y, obj.r);
        } else if (obj.shape == 'arrow') {
          arrow(obj.x1, obj.y1, obj.x2, obj.y2);
        } else if (obj.shape == 'text') {
          text(obj.x, obj.y, obj.size, obj.text);
        }
      }
    }
  };

  function connectCircles(c1, c2) {
    var x1 = c1.x;
    var y1 = c1.y;
    var x2 = c2.x;
    var y2 = c2.y;
    var dx = x2 - x1;
    var dy = y2 - y1;
    var dr = Math.sqrt(dx * dx + dy * dy);
    dx /= dr;
    dy /= dr;
    return {
      shape : 'arrow',
      x1 : x1 + dx * c1.r,
      y1 : y1 + dy * c1.r,
      x2 : x2 - dx * c2.r,
      y2 : y2 - dy * c2.r
    };
  }

  function drawBinaryTree(tree) {
    for (var i in tree) {
      var T = tree[i];
      T.offset = 0;
      T.thread = false;
    }
    
    var minsep = 120;
    
    function setup(t, level, rmost, lmost) {
      var T = tree[t];
      if (T) {
        var LL = {};
        var LR = {};
        var RL = {};
        var RR = {};
        T.y = level;
        var L = T.link[0];
        var R = T.link[1];
        setup(L, level + 1, LR, LL);
        setup(R, level + 1, RR, RL);
        
        if (T.link.length == 0) {
          rmost.addr = t;
          lmost.addr = t;
          lmost.lev = level;
          rmost.lev = level;
          lmost.off = 0;
          rmost.off = 0;
          T.offset = 0;
        } else {
          var cursep = minsep;
          var rootsep = minsep;
          var loffsum = 0;
          var roffsum = 0;
          
          while (L && R) {
            if (cursep < minsep) {
              rootsep += minsep - cursep;
              cursep = minsep;
            }
            
            if (tree[L].link[1]) {
              loffsum += tree[L].offset;
              cursep -= tree[L].offset;
              L = tree[L].link[1];
            } else {
              loffsum -= tree[L].offset;
              cursep += tree[L].offset;
              L = tree[L].link[0];
            }
            
            if (tree[R].link[0]) {
              roffsum -= tree[R].offset;
              cursep -= tree[R].offset;
              R = tree[R].link[0];
            } else {
              roffsum += tree[R].offset;
              cursep += tree[R].offset;
              R = tree[R].link[1];
            }
          }
          
          T.offset = (rootsep + 1) / 2;
          loffsum -= T.offset;
          roffsum += T.offset;
          
          if (RL.lev > LL.lev || !T.link[0]) {
            lmost.addr = RL.addr;
            lmost.lev = RL.lev;
            lmost.off = RL.off + T.offset;
          } else {
            lmost.addr = LL.addr;
            lmost.lev = LL.lev;
            lmost.off = LL.off - T.offset;
          }
          
          if (LR.lev > RR.lev || !T.link[1]) {
            rmost.addr = LR.addr;
            rmost.lev = LR.lev;
            rmost.off = LR.off - T.offset;
          } else {
            rmost.addr = RR.addr;
            rmost.lev = RR.lev;
            rmost.off = RR.off + T.offset;
          }
          
          if (tree[L] && L != T.link[0]) {
            tree[RR.addr].thread = true;
            tree[RR.addr].offset = Math.abs((RR.off + T.offset) - loffsum);
            if (loffsum - T.offset <= RR.off) {
              tree[RR.addr].link[0] = L;
            } else {
              tree[RR.addr].link[1] = L;
            }
          } else if (tree[R] && R != T.link[1]) {
            tree[LL.addr].thread = true;
            tree[LL.addr].offset = Math.abs((LL.off - T.offset) - loffsum);
            if (roffsum + T.offset >= LL.off) {
              tree[LL.addr].link[1] = R;
            } else {
              tree[LL.addr].link[0] = R;
            }
          }
        }
      } else {
        lmost.lev = -1;
        rmost.lev = -1;
      }
    }
    
    function petrify(t, xpos) {
      var T = tree[t];
      if (T) {
        T.x = xpos;
        if (T.thread) {
          T.thread = false;
          T.link = [];
        }
        petrify(T.link[0], xpos - T.offset);
        petrify(T.link[1], xpos + T.offset);
      }
    }
    
    setup(0, 0, {}, {});
    petrify(0, 0);
    
    var collage = [];
    
    for (var i in tree) {
      var T = tree[i];
      var x = T.x;
      var y = T.y * 70;
      T.circ = {
        shape : "circle",
        x : x,
        y : y,
        r : 20
      };
      collage.push(T.circ);
      collage.push({
        shape: "text",
        x : x,
        y : y,
        size : 24,
        text : T.label
      });
    }
    
    for (var i in tree) {
      var T = tree[i];
      for (var j in T.link) {
        collage.push(connectCircles(T.circ, tree[T.link[j]].circ));
      }
    }
    
    return new Drawing(collage);
  }

  var In = [];
  var Out = [];
  var _current = 0;

  function textarea(table) {
    var nextArea = null;
    var outLabel = null;
    var replyContainer = null;
    var reply = null;

    var inRow = addRow(table, 3);
    var outRow = addRow(table, 3);

    var inLabel = add(inRow[1], "pre");
    inLabel.style.color = "blue";
    inLabel.textContent = "In[ ]:";

    var area = add(inRow[2], "textarea");
    area.cols = 40;
    area.rows = 1;
    area.style.fontFamily = "monospace";
    area.style.fontSize = "larger";
    area.onkeyup = function(e) {
      var cnt = 1;
      for (var i in area.value) {
        if (area.value[i] == '\n') {
          cnt++;
        }
      }
      area.rows = cnt;
    };
    function run() {
      if (replyContainer == null) {
        replyContainer = outRow[2];
        outLabel = add(outRow[1], "pre");
        outLabel.style.color = "brown";
      }
      var curLocal = ++_current;
      In[curLocal] = area.value;
      localStorage.setItem("com.urbanowicz.jsinteractive._current", _current);
      localStorage.setItem("com.urbanowicz.jsinteractive.In[" + curLocal + "]", In[curLocal]);
      inLabel.textContent = "In[" + curLocal + "]:";
      if (reply != null) {
        reply.remove();
      }
      try {
        var result = eval(area.value);
        Out[curLocal] = result;

        if (result instanceof Drawing) {
          reply = add(replyContainer, "canvas");
          result.draw(reply);
        } else if (result instanceof HTMLElement) {
          reply = result;
          replyContainer.appendChild(reply);
        } else {
          reply = add(replyContainer, "pre");
          reply.style.color = "";
          reply.textContent = JSON.stringify(result, null, 2);
        }
      } catch (e) {
        if (reply != null) {
          reply.remove();
        }
        reply = add(replyContainer, "div");
        reply.style.color = "red";
        reply.textContent = e.message;
        Out[curLocal] = e;
      }
      outLabel.textContent = "Out[" + curLocal + "]:";
      if (nextArea == null) {
        nextArea = textarea(table)[1];
      } else {
        nextArea.focus();
      }
    }
    area.onkeypress = function(e) {
      if (e.shiftKey && e.keyCode == 13) {
        run();
        return false;
      } else if (e.charCode == 13 && area.selectionStart == area.selectionEnd) {
        var idx = area.selectionStart;
        var indTxt = "\n";
        for (var i = idx - 1; i >= 0 && area.value[i] != '\n'; i--) {
          if (area.value[i] == ' ') {
            indTxt += " ";
          } else {
            indTxt = "\n";
          }
        }
        area.value = area.value.slice(0, idx) + indTxt + area.value.slice(idx);
        area.selectionStart = idx + indTxt.length;
        area.selectionEnd = area.selectionStart;
        return false;
      }
    };

    var button = add(inRow[3], "button");
    button.textContent = "Run";
    button.onclick = run;

    area.focus();
    return [inLabel, area, function(nxt) {
      nextArea = nxt;
    }];
  }

  window.onload = function() {
    var table = add(document.body, "table");
    var cur = localStorage.getItem("com.urbanowicz.jsinteractive._current");
    if (cur) {
      _current = cur;
      var prvs;
      for (var i = 1; i <= _current; i++) {
        In[i] = localStorage.getItem("com.urbanowicz.jsinteractive.In[" + i + "]");
        var inRow = textarea(table);
        inRow[0].textContent = "In[" + i + "]";
        inRow[1].value = In[i];
        inRow[1].onkeyup();
        if (prvs) {
          prvs(inRow[1]);
        }
        prvs = inRow[2];
      }
    }
    var inRow = textarea(table);
    if (prvs) {
      prvs(inRow[1]);
    }
  };
}();
