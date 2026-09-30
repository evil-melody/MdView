(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __commonJS = (cb, mod) => function __require2() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // node_modules/jszip/dist/jszip.min.js
  var require_jszip_min = __commonJS({
    "node_modules/jszip/dist/jszip.min.js"(exports2, module) {
      !function(e) {
        if ("object" == typeof exports2 && "undefined" != typeof module) module.exports = e();
        else if ("function" == typeof define && define.amd) define([], e);
        else {
          ("undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof self ? self : this).JSZip = e();
        }
      }(function() {
        return function s(a, o, h) {
          function u(r, e2) {
            if (!o[r]) {
              if (!a[r]) {
                var t = "function" == typeof __require && __require;
                if (!e2 && t) return t(r, true);
                if (l) return l(r, true);
                var n = new Error("Cannot find module '" + r + "'");
                throw n.code = "MODULE_NOT_FOUND", n;
              }
              var i = o[r] = { exports: {} };
              a[r][0].call(i.exports, function(e3) {
                var t2 = a[r][1][e3];
                return u(t2 || e3);
              }, i, i.exports, s, a, o, h);
            }
            return o[r].exports;
          }
          for (var l = "function" == typeof __require && __require, e = 0; e < h.length; e++) u(h[e]);
          return u;
        }({ 1: [function(e, t, r) {
          "use strict";
          var d = e("./utils"), c = e("./support"), p = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
          r.encode = function(e2) {
            for (var t2, r2, n, i, s, a, o, h = [], u = 0, l = e2.length, f = l, c2 = "string" !== d.getTypeOf(e2); u < e2.length; ) f = l - u, n = c2 ? (t2 = e2[u++], r2 = u < l ? e2[u++] : 0, u < l ? e2[u++] : 0) : (t2 = e2.charCodeAt(u++), r2 = u < l ? e2.charCodeAt(u++) : 0, u < l ? e2.charCodeAt(u++) : 0), i = t2 >> 2, s = (3 & t2) << 4 | r2 >> 4, a = 1 < f ? (15 & r2) << 2 | n >> 6 : 64, o = 2 < f ? 63 & n : 64, h.push(p.charAt(i) + p.charAt(s) + p.charAt(a) + p.charAt(o));
            return h.join("");
          }, r.decode = function(e2) {
            var t2, r2, n, i, s, a, o = 0, h = 0, u = "data:";
            if (e2.substr(0, u.length) === u) throw new Error("Invalid base64 input, it looks like a data url.");
            var l, f = 3 * (e2 = e2.replace(/[^A-Za-z0-9+/=]/g, "")).length / 4;
            if (e2.charAt(e2.length - 1) === p.charAt(64) && f--, e2.charAt(e2.length - 2) === p.charAt(64) && f--, f % 1 != 0) throw new Error("Invalid base64 input, bad content length.");
            for (l = c.uint8array ? new Uint8Array(0 | f) : new Array(0 | f); o < e2.length; ) t2 = p.indexOf(e2.charAt(o++)) << 2 | (i = p.indexOf(e2.charAt(o++))) >> 4, r2 = (15 & i) << 4 | (s = p.indexOf(e2.charAt(o++))) >> 2, n = (3 & s) << 6 | (a = p.indexOf(e2.charAt(o++))), l[h++] = t2, 64 !== s && (l[h++] = r2), 64 !== a && (l[h++] = n);
            return l;
          };
        }, { "./support": 30, "./utils": 32 }], 2: [function(e, t, r) {
          "use strict";
          var n = e("./external"), i = e("./stream/DataWorker"), s = e("./stream/Crc32Probe"), a = e("./stream/DataLengthProbe");
          function o(e2, t2, r2, n2, i2) {
            this.compressedSize = e2, this.uncompressedSize = t2, this.crc32 = r2, this.compression = n2, this.compressedContent = i2;
          }
          o.prototype = { getContentWorker: function() {
            var e2 = new i(n.Promise.resolve(this.compressedContent)).pipe(this.compression.uncompressWorker()).pipe(new a("data_length")), t2 = this;
            return e2.on("end", function() {
              if (this.streamInfo.data_length !== t2.uncompressedSize) throw new Error("Bug : uncompressed data size mismatch");
            }), e2;
          }, getCompressedWorker: function() {
            return new i(n.Promise.resolve(this.compressedContent)).withStreamInfo("compressedSize", this.compressedSize).withStreamInfo("uncompressedSize", this.uncompressedSize).withStreamInfo("crc32", this.crc32).withStreamInfo("compression", this.compression);
          } }, o.createWorkerFrom = function(e2, t2, r2) {
            return e2.pipe(new s()).pipe(new a("uncompressedSize")).pipe(t2.compressWorker(r2)).pipe(new a("compressedSize")).withStreamInfo("compression", t2);
          }, t.exports = o;
        }, { "./external": 6, "./stream/Crc32Probe": 25, "./stream/DataLengthProbe": 26, "./stream/DataWorker": 27 }], 3: [function(e, t, r) {
          "use strict";
          var n = e("./stream/GenericWorker");
          r.STORE = { magic: "\0\0", compressWorker: function() {
            return new n("STORE compression");
          }, uncompressWorker: function() {
            return new n("STORE decompression");
          } }, r.DEFLATE = e("./flate");
        }, { "./flate": 7, "./stream/GenericWorker": 28 }], 4: [function(e, t, r) {
          "use strict";
          var n = e("./utils");
          var o = function() {
            for (var e2, t2 = [], r2 = 0; r2 < 256; r2++) {
              e2 = r2;
              for (var n2 = 0; n2 < 8; n2++) e2 = 1 & e2 ? 3988292384 ^ e2 >>> 1 : e2 >>> 1;
              t2[r2] = e2;
            }
            return t2;
          }();
          t.exports = function(e2, t2) {
            return void 0 !== e2 && e2.length ? "string" !== n.getTypeOf(e2) ? function(e3, t3, r2, n2) {
              var i = o, s = n2 + r2;
              e3 ^= -1;
              for (var a = n2; a < s; a++) e3 = e3 >>> 8 ^ i[255 & (e3 ^ t3[a])];
              return -1 ^ e3;
            }(0 | t2, e2, e2.length, 0) : function(e3, t3, r2, n2) {
              var i = o, s = n2 + r2;
              e3 ^= -1;
              for (var a = n2; a < s; a++) e3 = e3 >>> 8 ^ i[255 & (e3 ^ t3.charCodeAt(a))];
              return -1 ^ e3;
            }(0 | t2, e2, e2.length, 0) : 0;
          };
        }, { "./utils": 32 }], 5: [function(e, t, r) {
          "use strict";
          r.base64 = false, r.binary = false, r.dir = false, r.createFolders = true, r.date = null, r.compression = null, r.compressionOptions = null, r.comment = null, r.unixPermissions = null, r.dosPermissions = null;
        }, {}], 6: [function(e, t, r) {
          "use strict";
          var n = null;
          n = "undefined" != typeof Promise ? Promise : e("lie"), t.exports = { Promise: n };
        }, { lie: 37 }], 7: [function(e, t, r) {
          "use strict";
          var n = "undefined" != typeof Uint8Array && "undefined" != typeof Uint16Array && "undefined" != typeof Uint32Array, i = e("pako"), s = e("./utils"), a = e("./stream/GenericWorker"), o = n ? "uint8array" : "array";
          function h(e2, t2) {
            a.call(this, "FlateWorker/" + e2), this._pako = null, this._pakoAction = e2, this._pakoOptions = t2, this.meta = {};
          }
          r.magic = "\b\0", s.inherits(h, a), h.prototype.processChunk = function(e2) {
            this.meta = e2.meta, null === this._pako && this._createPako(), this._pako.push(s.transformTo(o, e2.data), false);
          }, h.prototype.flush = function() {
            a.prototype.flush.call(this), null === this._pako && this._createPako(), this._pako.push([], true);
          }, h.prototype.cleanUp = function() {
            a.prototype.cleanUp.call(this), this._pako = null;
          }, h.prototype._createPako = function() {
            this._pako = new i[this._pakoAction]({ raw: true, level: this._pakoOptions.level || -1 });
            var t2 = this;
            this._pako.onData = function(e2) {
              t2.push({ data: e2, meta: t2.meta });
            };
          }, r.compressWorker = function(e2) {
            return new h("Deflate", e2);
          }, r.uncompressWorker = function() {
            return new h("Inflate", {});
          };
        }, { "./stream/GenericWorker": 28, "./utils": 32, pako: 38 }], 8: [function(e, t, r) {
          "use strict";
          function A(e2, t2) {
            var r2, n2 = "";
            for (r2 = 0; r2 < t2; r2++) n2 += String.fromCharCode(255 & e2), e2 >>>= 8;
            return n2;
          }
          function n(e2, t2, r2, n2, i2, s2) {
            var a, o, h = e2.file, u = e2.compression, l = s2 !== O.utf8encode, f = I.transformTo("string", s2(h.name)), c = I.transformTo("string", O.utf8encode(h.name)), d = h.comment, p = I.transformTo("string", s2(d)), m = I.transformTo("string", O.utf8encode(d)), _ = c.length !== h.name.length, g = m.length !== d.length, b = "", v = "", y = "", w = h.dir, k = h.date, x = { crc32: 0, compressedSize: 0, uncompressedSize: 0 };
            t2 && !r2 || (x.crc32 = e2.crc32, x.compressedSize = e2.compressedSize, x.uncompressedSize = e2.uncompressedSize);
            var S = 0;
            t2 && (S |= 8), l || !_ && !g || (S |= 2048);
            var z = 0, C = 0;
            w && (z |= 16), "UNIX" === i2 ? (C = 798, z |= function(e3, t3) {
              var r3 = e3;
              return e3 || (r3 = t3 ? 16893 : 33204), (65535 & r3) << 16;
            }(h.unixPermissions, w)) : (C = 20, z |= function(e3) {
              return 63 & (e3 || 0);
            }(h.dosPermissions)), a = k.getUTCHours(), a <<= 6, a |= k.getUTCMinutes(), a <<= 5, a |= k.getUTCSeconds() / 2, o = k.getUTCFullYear() - 1980, o <<= 4, o |= k.getUTCMonth() + 1, o <<= 5, o |= k.getUTCDate(), _ && (v = A(1, 1) + A(B(f), 4) + c, b += "up" + A(v.length, 2) + v), g && (y = A(1, 1) + A(B(p), 4) + m, b += "uc" + A(y.length, 2) + y);
            var E = "";
            return E += "\n\0", E += A(S, 2), E += u.magic, E += A(a, 2), E += A(o, 2), E += A(x.crc32, 4), E += A(x.compressedSize, 4), E += A(x.uncompressedSize, 4), E += A(f.length, 2), E += A(b.length, 2), { fileRecord: R.LOCAL_FILE_HEADER + E + f + b, dirRecord: R.CENTRAL_FILE_HEADER + A(C, 2) + E + A(p.length, 2) + "\0\0\0\0" + A(z, 4) + A(n2, 4) + f + b + p };
          }
          var I = e("../utils"), i = e("../stream/GenericWorker"), O = e("../utf8"), B = e("../crc32"), R = e("../signature");
          function s(e2, t2, r2, n2) {
            i.call(this, "ZipFileWorker"), this.bytesWritten = 0, this.zipComment = t2, this.zipPlatform = r2, this.encodeFileName = n2, this.streamFiles = e2, this.accumulate = false, this.contentBuffer = [], this.dirRecords = [], this.currentSourceOffset = 0, this.entriesCount = 0, this.currentFile = null, this._sources = [];
          }
          I.inherits(s, i), s.prototype.push = function(e2) {
            var t2 = e2.meta.percent || 0, r2 = this.entriesCount, n2 = this._sources.length;
            this.accumulate ? this.contentBuffer.push(e2) : (this.bytesWritten += e2.data.length, i.prototype.push.call(this, { data: e2.data, meta: { currentFile: this.currentFile, percent: r2 ? (t2 + 100 * (r2 - n2 - 1)) / r2 : 100 } }));
          }, s.prototype.openedSource = function(e2) {
            this.currentSourceOffset = this.bytesWritten, this.currentFile = e2.file.name;
            var t2 = this.streamFiles && !e2.file.dir;
            if (t2) {
              var r2 = n(e2, t2, false, this.currentSourceOffset, this.zipPlatform, this.encodeFileName);
              this.push({ data: r2.fileRecord, meta: { percent: 0 } });
            } else this.accumulate = true;
          }, s.prototype.closedSource = function(e2) {
            this.accumulate = false;
            var t2 = this.streamFiles && !e2.file.dir, r2 = n(e2, t2, true, this.currentSourceOffset, this.zipPlatform, this.encodeFileName);
            if (this.dirRecords.push(r2.dirRecord), t2) this.push({ data: function(e3) {
              return R.DATA_DESCRIPTOR + A(e3.crc32, 4) + A(e3.compressedSize, 4) + A(e3.uncompressedSize, 4);
            }(e2), meta: { percent: 100 } });
            else for (this.push({ data: r2.fileRecord, meta: { percent: 0 } }); this.contentBuffer.length; ) this.push(this.contentBuffer.shift());
            this.currentFile = null;
          }, s.prototype.flush = function() {
            for (var e2 = this.bytesWritten, t2 = 0; t2 < this.dirRecords.length; t2++) this.push({ data: this.dirRecords[t2], meta: { percent: 100 } });
            var r2 = this.bytesWritten - e2, n2 = function(e3, t3, r3, n3, i2) {
              var s2 = I.transformTo("string", i2(n3));
              return R.CENTRAL_DIRECTORY_END + "\0\0\0\0" + A(e3, 2) + A(e3, 2) + A(t3, 4) + A(r3, 4) + A(s2.length, 2) + s2;
            }(this.dirRecords.length, r2, e2, this.zipComment, this.encodeFileName);
            this.push({ data: n2, meta: { percent: 100 } });
          }, s.prototype.prepareNextSource = function() {
            this.previous = this._sources.shift(), this.openedSource(this.previous.streamInfo), this.isPaused ? this.previous.pause() : this.previous.resume();
          }, s.prototype.registerPrevious = function(e2) {
            this._sources.push(e2);
            var t2 = this;
            return e2.on("data", function(e3) {
              t2.processChunk(e3);
            }), e2.on("end", function() {
              t2.closedSource(t2.previous.streamInfo), t2._sources.length ? t2.prepareNextSource() : t2.end();
            }), e2.on("error", function(e3) {
              t2.error(e3);
            }), this;
          }, s.prototype.resume = function() {
            return !!i.prototype.resume.call(this) && (!this.previous && this._sources.length ? (this.prepareNextSource(), true) : this.previous || this._sources.length || this.generatedError ? void 0 : (this.end(), true));
          }, s.prototype.error = function(e2) {
            var t2 = this._sources;
            if (!i.prototype.error.call(this, e2)) return false;
            for (var r2 = 0; r2 < t2.length; r2++) try {
              t2[r2].error(e2);
            } catch (e3) {
            }
            return true;
          }, s.prototype.lock = function() {
            i.prototype.lock.call(this);
            for (var e2 = this._sources, t2 = 0; t2 < e2.length; t2++) e2[t2].lock();
          }, t.exports = s;
        }, { "../crc32": 4, "../signature": 23, "../stream/GenericWorker": 28, "../utf8": 31, "../utils": 32 }], 9: [function(e, t, r) {
          "use strict";
          var u = e("../compressions"), n = e("./ZipFileWorker");
          r.generateWorker = function(e2, a, t2) {
            var o = new n(a.streamFiles, t2, a.platform, a.encodeFileName), h = 0;
            try {
              e2.forEach(function(e3, t3) {
                h++;
                var r2 = function(e4, t4) {
                  var r3 = e4 || t4, n3 = u[r3];
                  if (!n3) throw new Error(r3 + " is not a valid compression method !");
                  return n3;
                }(t3.options.compression, a.compression), n2 = t3.options.compressionOptions || a.compressionOptions || {}, i = t3.dir, s = t3.date;
                t3._compressWorker(r2, n2).withStreamInfo("file", { name: e3, dir: i, date: s, comment: t3.comment || "", unixPermissions: t3.unixPermissions, dosPermissions: t3.dosPermissions }).pipe(o);
              }), o.entriesCount = h;
            } catch (e3) {
              o.error(e3);
            }
            return o;
          };
        }, { "../compressions": 3, "./ZipFileWorker": 8 }], 10: [function(e, t, r) {
          "use strict";
          function n() {
            if (!(this instanceof n)) return new n();
            if (arguments.length) throw new Error("The constructor with parameters has been removed in JSZip 3.0, please check the upgrade guide.");
            this.files = /* @__PURE__ */ Object.create(null), this.comment = null, this.root = "", this.clone = function() {
              var e2 = new n();
              for (var t2 in this) "function" != typeof this[t2] && (e2[t2] = this[t2]);
              return e2;
            };
          }
          (n.prototype = e("./object")).loadAsync = e("./load"), n.support = e("./support"), n.defaults = e("./defaults"), n.version = "3.10.2", n.loadAsync = function(e2, t2) {
            return new n().loadAsync(e2, t2);
          }, n.external = e("./external"), t.exports = n;
        }, { "./defaults": 5, "./external": 6, "./load": 11, "./object": 15, "./support": 30 }], 11: [function(e, t, r) {
          "use strict";
          var u = e("./utils"), i = e("./external"), n = e("./utf8"), s = e("./zipEntries"), a = e("./stream/Crc32Probe"), l = e("./nodejsUtils");
          function f(n2) {
            return new i.Promise(function(e2, t2) {
              var r2 = n2.decompressed.getContentWorker().pipe(new a());
              r2.on("error", function(e3) {
                t2(e3);
              }).on("end", function() {
                r2.streamInfo.crc32 !== n2.decompressed.crc32 ? t2(new Error("Corrupted zip : CRC32 mismatch")) : e2();
              }).resume();
            });
          }
          t.exports = function(e2, o) {
            var h = this;
            return o = u.extend(o || {}, { base64: false, checkCRC32: false, optimizedBinaryString: false, createFolders: false, decodeFileName: n.utf8decode }), l.isNode && l.isStream(e2) ? i.Promise.reject(new Error("JSZip can't accept a stream when loading a zip file.")) : u.prepareContent("the loaded zip file", e2, true, o.optimizedBinaryString, o.base64).then(function(e3) {
              var t2 = new s(o);
              return t2.load(e3), t2;
            }).then(function(e3) {
              var t2 = [i.Promise.resolve(e3)], r2 = e3.files;
              if (o.checkCRC32) for (var n2 = 0; n2 < r2.length; n2++) t2.push(f(r2[n2]));
              return i.Promise.all(t2);
            }).then(function(e3) {
              for (var t2 = e3.shift(), r2 = t2.files, n2 = 0; n2 < r2.length; n2++) {
                var i2 = r2[n2], s2 = i2.fileNameStr, a2 = u.resolve(i2.fileNameStr);
                h.file(a2, i2.decompressed, { binary: true, optimizedBinaryString: true, date: i2.date, dir: i2.dir, comment: i2.fileCommentStr.length ? i2.fileCommentStr : null, unixPermissions: i2.unixPermissions, dosPermissions: i2.dosPermissions, createFolders: o.createFolders }), i2.dir || (h.file(a2).unsafeOriginalName = s2);
              }
              return t2.zipComment.length && (h.comment = t2.zipComment), h;
            });
          };
        }, { "./external": 6, "./nodejsUtils": 14, "./stream/Crc32Probe": 25, "./utf8": 31, "./utils": 32, "./zipEntries": 33 }], 12: [function(e, t, r) {
          "use strict";
          var n = e("../utils"), i = e("../stream/GenericWorker");
          function s(e2, t2) {
            i.call(this, "Nodejs stream input adapter for " + e2), this._upstreamEnded = false, this._bindStream(t2);
          }
          n.inherits(s, i), s.prototype._bindStream = function(e2) {
            var t2 = this;
            (this._stream = e2).pause(), e2.on("data", function(e3) {
              t2.push({ data: e3, meta: { percent: 0 } });
            }).on("error", function(e3) {
              t2.isPaused ? this.generatedError = e3 : t2.error(e3);
            }).on("end", function() {
              t2.isPaused ? t2._upstreamEnded = true : t2.end();
            });
          }, s.prototype.pause = function() {
            return !!i.prototype.pause.call(this) && (this._stream.pause(), true);
          }, s.prototype.resume = function() {
            return !!i.prototype.resume.call(this) && (this._upstreamEnded ? this.end() : this._stream.resume(), true);
          }, t.exports = s;
        }, { "../stream/GenericWorker": 28, "../utils": 32 }], 13: [function(e, t, r) {
          "use strict";
          var i = e("readable-stream").Readable;
          function n(e2, t2, r2) {
            i.call(this, t2), this._helper = e2;
            var n2 = this;
            e2.on("data", function(e3, t3) {
              n2.push(e3) || n2._helper.pause(), r2 && r2(t3);
            }).on("error", function(e3) {
              n2.emit("error", e3);
            }).on("end", function() {
              n2.push(null);
            });
          }
          e("../utils").inherits(n, i), n.prototype._read = function() {
            this._helper.resume();
          }, t.exports = n;
        }, { "../utils": 32, "readable-stream": 16 }], 14: [function(e, t, r) {
          "use strict";
          t.exports = { isNode: "undefined" != typeof Buffer, newBufferFrom: function(e2, t2) {
            if (Buffer.from && Buffer.from !== Uint8Array.from) return Buffer.from(e2, t2);
            if ("number" == typeof e2) throw new Error('The "data" argument must not be a number');
            return new Buffer(e2, t2);
          }, allocBuffer: function(e2) {
            if (Buffer.alloc) return Buffer.alloc(e2);
            var t2 = new Buffer(e2);
            return t2.fill(0), t2;
          }, isBuffer: function(e2) {
            return Buffer.isBuffer(e2);
          }, isStream: function(e2) {
            return e2 && "function" == typeof e2.on && "function" == typeof e2.pause && "function" == typeof e2.resume;
          } };
        }, {}], 15: [function(e, t, r) {
          "use strict";
          function s(e2, t2, r2) {
            var n2, i2 = u.getTypeOf(t2), s2 = u.extend(r2 || {}, f);
            s2.date = s2.date || /* @__PURE__ */ new Date(), null !== s2.compression && (s2.compression = s2.compression.toUpperCase()), "string" == typeof s2.unixPermissions && (s2.unixPermissions = parseInt(s2.unixPermissions, 8)), s2.unixPermissions && 16384 & s2.unixPermissions && (s2.dir = true), s2.dosPermissions && 16 & s2.dosPermissions && (s2.dir = true), s2.dir && (e2 = g(e2)), s2.createFolders && (n2 = _(e2)) && b.call(this, n2, true);
            var a2 = "string" === i2 && false === s2.binary && false === s2.base64;
            r2 && void 0 !== r2.binary || (s2.binary = !a2), (t2 instanceof c && 0 === t2.uncompressedSize || s2.dir || !t2 || 0 === t2.length) && (s2.base64 = false, s2.binary = true, t2 = "", s2.compression = "STORE", i2 = "string");
            var o2 = null;
            o2 = t2 instanceof c || t2 instanceof l ? t2 : p.isNode && p.isStream(t2) ? new m(e2, t2) : u.prepareContent(e2, t2, s2.binary, s2.optimizedBinaryString, s2.base64);
            var h2 = new d(e2, o2, s2);
            this.files[e2] = h2;
          }
          var i = e("./utf8"), u = e("./utils"), l = e("./stream/GenericWorker"), a = e("./stream/StreamHelper"), f = e("./defaults"), c = e("./compressedObject"), d = e("./zipObject"), o = e("./generate"), p = e("./nodejsUtils"), m = e("./nodejs/NodejsStreamInputAdapter"), _ = function(e2) {
            "/" === e2.slice(-1) && (e2 = e2.substring(0, e2.length - 1));
            var t2 = e2.lastIndexOf("/");
            return 0 < t2 ? e2.substring(0, t2) : "";
          }, g = function(e2) {
            return "/" !== e2.slice(-1) && (e2 += "/"), e2;
          }, b = function(e2, t2) {
            return t2 = void 0 !== t2 ? t2 : f.createFolders, e2 = g(e2), this.files[e2] || s.call(this, e2, null, { dir: true, createFolders: t2 }), this.files[e2];
          };
          function h(e2) {
            return "[object RegExp]" === Object.prototype.toString.call(e2);
          }
          var n = { load: function() {
            throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
          }, forEach: function(e2) {
            var t2, r2, n2;
            for (t2 in this.files) n2 = this.files[t2], (r2 = t2.slice(this.root.length, t2.length)) && t2.slice(0, this.root.length) === this.root && e2(r2, n2);
          }, filter: function(r2) {
            var n2 = [];
            return this.forEach(function(e2, t2) {
              r2(e2, t2) && n2.push(t2);
            }), n2;
          }, file: function(e2, t2, r2) {
            if (1 !== arguments.length) return e2 = this.root + e2, s.call(this, e2, t2, r2), this;
            if (h(e2)) {
              var n2 = e2;
              return this.filter(function(e3, t3) {
                return !t3.dir && n2.test(e3);
              });
            }
            var i2 = this.files[this.root + e2];
            return i2 && !i2.dir ? i2 : null;
          }, folder: function(r2) {
            if (!r2) return this;
            if (h(r2)) return this.filter(function(e3, t3) {
              return t3.dir && r2.test(e3);
            });
            var e2 = this.root + r2, t2 = b.call(this, e2), n2 = this.clone();
            return n2.root = t2.name, n2;
          }, remove: function(r2) {
            r2 = this.root + r2;
            var e2 = this.files[r2];
            if (e2 || ("/" !== r2.slice(-1) && (r2 += "/"), e2 = this.files[r2]), e2 && !e2.dir) delete this.files[r2];
            else for (var t2 = this.filter(function(e3, t3) {
              return t3.name.slice(0, r2.length) === r2;
            }), n2 = 0; n2 < t2.length; n2++) delete this.files[t2[n2].name];
            return this;
          }, generate: function() {
            throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
          }, generateInternalStream: function(e2) {
            var t2, r2 = {};
            try {
              if ((r2 = u.extend(e2 || {}, { streamFiles: false, compression: "STORE", compressionOptions: null, type: "", platform: "DOS", comment: null, mimeType: "application/zip", encodeFileName: i.utf8encode })).type = r2.type.toLowerCase(), r2.compression = r2.compression.toUpperCase(), "binarystring" === r2.type && (r2.type = "string"), !r2.type) throw new Error("No output type specified.");
              u.checkSupport(r2.type), "darwin" !== r2.platform && "freebsd" !== r2.platform && "linux" !== r2.platform && "sunos" !== r2.platform || (r2.platform = "UNIX"), "win32" === r2.platform && (r2.platform = "DOS");
              var n2 = r2.comment || this.comment || "";
              t2 = o.generateWorker(this, r2, n2);
            } catch (e3) {
              (t2 = new l("error")).error(e3);
            }
            return new a(t2, r2.type || "string", r2.mimeType);
          }, generateAsync: function(e2, t2) {
            return this.generateInternalStream(e2).accumulate(t2);
          }, generateNodeStream: function(e2, t2) {
            return (e2 = e2 || {}).type || (e2.type = "nodebuffer"), this.generateInternalStream(e2).toNodejsStream(t2);
          } };
          t.exports = n;
        }, { "./compressedObject": 2, "./defaults": 5, "./generate": 9, "./nodejs/NodejsStreamInputAdapter": 12, "./nodejsUtils": 14, "./stream/GenericWorker": 28, "./stream/StreamHelper": 29, "./utf8": 31, "./utils": 32, "./zipObject": 35 }], 16: [function(e, t, r) {
          "use strict";
          t.exports = e("stream");
        }, { stream: void 0 }], 17: [function(e, t, r) {
          "use strict";
          var n = e("./DataReader");
          function i(e2) {
            n.call(this, e2);
            for (var t2 = 0; t2 < this.data.length; t2++) e2[t2] = 255 & e2[t2];
          }
          e("../utils").inherits(i, n), i.prototype.byteAt = function(e2) {
            return this.data[this.zero + e2];
          }, i.prototype.lastIndexOfSignature = function(e2) {
            for (var t2 = e2.charCodeAt(0), r2 = e2.charCodeAt(1), n2 = e2.charCodeAt(2), i2 = e2.charCodeAt(3), s = this.length - 4; 0 <= s; --s) if (this.data[s] === t2 && this.data[s + 1] === r2 && this.data[s + 2] === n2 && this.data[s + 3] === i2) return s - this.zero;
            return -1;
          }, i.prototype.readAndCheckSignature = function(e2) {
            var t2 = e2.charCodeAt(0), r2 = e2.charCodeAt(1), n2 = e2.charCodeAt(2), i2 = e2.charCodeAt(3), s = this.readData(4);
            return t2 === s[0] && r2 === s[1] && n2 === s[2] && i2 === s[3];
          }, i.prototype.readData = function(e2) {
            if (this.checkOffset(e2), 0 === e2) return [];
            var t2 = this.data.slice(this.zero + this.index, this.zero + this.index + e2);
            return this.index += e2, t2;
          }, t.exports = i;
        }, { "../utils": 32, "./DataReader": 18 }], 18: [function(e, t, r) {
          "use strict";
          var n = e("../utils");
          function i(e2) {
            this.data = e2, this.length = e2.length, this.index = 0, this.zero = 0;
          }
          i.prototype = { checkOffset: function(e2) {
            this.checkIndex(this.index + e2);
          }, checkIndex: function(e2) {
            if (this.length < this.zero + e2 || e2 < 0) throw new Error("End of data reached (data length = " + this.length + ", asked index = " + e2 + "). Corrupted zip ?");
          }, setIndex: function(e2) {
            this.checkIndex(e2), this.index = e2;
          }, skip: function(e2) {
            this.setIndex(this.index + e2);
          }, byteAt: function() {
          }, readInt: function(e2) {
            var t2, r2 = 0;
            for (this.checkOffset(e2), t2 = this.index + e2 - 1; t2 >= this.index; t2--) r2 = (r2 << 8) + this.byteAt(t2);
            return this.index += e2, r2;
          }, readString: function(e2) {
            return n.transformTo("string", this.readData(e2));
          }, readData: function() {
          }, lastIndexOfSignature: function() {
          }, readAndCheckSignature: function() {
          }, readDate: function() {
            var e2 = this.readInt(4);
            return new Date(Date.UTC(1980 + (e2 >> 25 & 127), (e2 >> 21 & 15) - 1, e2 >> 16 & 31, e2 >> 11 & 31, e2 >> 5 & 63, (31 & e2) << 1));
          } }, t.exports = i;
        }, { "../utils": 32 }], 19: [function(e, t, r) {
          "use strict";
          var n = e("./Uint8ArrayReader");
          function i(e2) {
            n.call(this, e2);
          }
          e("../utils").inherits(i, n), i.prototype.readData = function(e2) {
            this.checkOffset(e2);
            var t2 = this.data.slice(this.zero + this.index, this.zero + this.index + e2);
            return this.index += e2, t2;
          }, t.exports = i;
        }, { "../utils": 32, "./Uint8ArrayReader": 21 }], 20: [function(e, t, r) {
          "use strict";
          var n = e("./DataReader");
          function i(e2) {
            n.call(this, e2);
          }
          e("../utils").inherits(i, n), i.prototype.byteAt = function(e2) {
            return this.data.charCodeAt(this.zero + e2);
          }, i.prototype.lastIndexOfSignature = function(e2) {
            return this.data.lastIndexOf(e2) - this.zero;
          }, i.prototype.readAndCheckSignature = function(e2) {
            return e2 === this.readData(4);
          }, i.prototype.readData = function(e2) {
            this.checkOffset(e2);
            var t2 = this.data.slice(this.zero + this.index, this.zero + this.index + e2);
            return this.index += e2, t2;
          }, t.exports = i;
        }, { "../utils": 32, "./DataReader": 18 }], 21: [function(e, t, r) {
          "use strict";
          var n = e("./ArrayReader");
          function i(e2) {
            n.call(this, e2);
          }
          e("../utils").inherits(i, n), i.prototype.readData = function(e2) {
            if (this.checkOffset(e2), 0 === e2) return new Uint8Array(0);
            var t2 = this.data.subarray(this.zero + this.index, this.zero + this.index + e2);
            return this.index += e2, t2;
          }, t.exports = i;
        }, { "../utils": 32, "./ArrayReader": 17 }], 22: [function(e, t, r) {
          "use strict";
          var n = e("../utils"), i = e("../support"), s = e("./ArrayReader"), a = e("./StringReader"), o = e("./NodeBufferReader"), h = e("./Uint8ArrayReader");
          t.exports = function(e2) {
            var t2 = n.getTypeOf(e2);
            return n.checkSupport(t2), "string" !== t2 || i.uint8array ? "nodebuffer" === t2 ? new o(e2) : i.uint8array ? new h(n.transformTo("uint8array", e2)) : new s(n.transformTo("array", e2)) : new a(e2);
          };
        }, { "../support": 30, "../utils": 32, "./ArrayReader": 17, "./NodeBufferReader": 19, "./StringReader": 20, "./Uint8ArrayReader": 21 }], 23: [function(e, t, r) {
          "use strict";
          r.LOCAL_FILE_HEADER = "PK", r.CENTRAL_FILE_HEADER = "PK", r.CENTRAL_DIRECTORY_END = "PK", r.ZIP64_CENTRAL_DIRECTORY_LOCATOR = "PK\x07", r.ZIP64_CENTRAL_DIRECTORY_END = "PK", r.DATA_DESCRIPTOR = "PK\x07\b";
        }, {}], 24: [function(e, t, r) {
          "use strict";
          var n = e("./GenericWorker"), i = e("../utils");
          function s(e2) {
            n.call(this, "ConvertWorker to " + e2), this.destType = e2;
          }
          i.inherits(s, n), s.prototype.processChunk = function(e2) {
            this.push({ data: i.transformTo(this.destType, e2.data), meta: e2.meta });
          }, t.exports = s;
        }, { "../utils": 32, "./GenericWorker": 28 }], 25: [function(e, t, r) {
          "use strict";
          var n = e("./GenericWorker"), i = e("../crc32");
          function s() {
            n.call(this, "Crc32Probe"), this.withStreamInfo("crc32", 0);
          }
          e("../utils").inherits(s, n), s.prototype.processChunk = function(e2) {
            this.streamInfo.crc32 = i(e2.data, this.streamInfo.crc32 || 0), this.push(e2);
          }, t.exports = s;
        }, { "../crc32": 4, "../utils": 32, "./GenericWorker": 28 }], 26: [function(e, t, r) {
          "use strict";
          var n = e("../utils"), i = e("./GenericWorker");
          function s(e2) {
            i.call(this, "DataLengthProbe for " + e2), this.propName = e2, this.withStreamInfo(e2, 0);
          }
          n.inherits(s, i), s.prototype.processChunk = function(e2) {
            if (e2) {
              var t2 = this.streamInfo[this.propName] || 0;
              this.streamInfo[this.propName] = t2 + e2.data.length;
            }
            i.prototype.processChunk.call(this, e2);
          }, t.exports = s;
        }, { "../utils": 32, "./GenericWorker": 28 }], 27: [function(e, t, r) {
          "use strict";
          var n = e("../utils"), i = e("./GenericWorker");
          function s(e2) {
            i.call(this, "DataWorker");
            var t2 = this;
            this.dataIsReady = false, this.index = 0, this.max = 0, this.data = null, this.type = "", this._tickScheduled = false, e2.then(function(e3) {
              t2.dataIsReady = true, t2.data = e3, t2.max = e3 && e3.length || 0, t2.type = n.getTypeOf(e3), t2.isPaused || t2._tickAndRepeat();
            }, function(e3) {
              t2.error(e3);
            });
          }
          n.inherits(s, i), s.prototype.cleanUp = function() {
            i.prototype.cleanUp.call(this), this.data = null;
          }, s.prototype.resume = function() {
            return !!i.prototype.resume.call(this) && (!this._tickScheduled && this.dataIsReady && (this._tickScheduled = true, n.delay(this._tickAndRepeat, [], this)), true);
          }, s.prototype._tickAndRepeat = function() {
            this._tickScheduled = false, this.isPaused || this.isFinished || (this._tick(), this.isFinished || (n.delay(this._tickAndRepeat, [], this), this._tickScheduled = true));
          }, s.prototype._tick = function() {
            if (this.isPaused || this.isFinished) return false;
            var e2 = null, t2 = Math.min(this.max, this.index + 16384);
            if (this.index >= this.max) return this.end();
            switch (this.type) {
              case "string":
                e2 = this.data.substring(this.index, t2);
                break;
              case "uint8array":
                e2 = this.data.subarray(this.index, t2);
                break;
              case "array":
              case "nodebuffer":
                e2 = this.data.slice(this.index, t2);
            }
            return this.index = t2, this.push({ data: e2, meta: { percent: this.max ? this.index / this.max * 100 : 0 } });
          }, t.exports = s;
        }, { "../utils": 32, "./GenericWorker": 28 }], 28: [function(e, t, r) {
          "use strict";
          function n(e2) {
            this.name = e2 || "default", this.streamInfo = {}, this.generatedError = null, this.extraStreamInfo = {}, this.isPaused = true, this.isFinished = false, this.isLocked = false, this._listeners = { data: [], end: [], error: [] }, this.previous = null;
          }
          n.prototype = { push: function(e2) {
            this.emit("data", e2);
          }, end: function() {
            if (this.isFinished) return false;
            this.flush();
            try {
              this.emit("end"), this.cleanUp(), this.isFinished = true;
            } catch (e2) {
              this.emit("error", e2);
            }
            return true;
          }, error: function(e2) {
            return !this.isFinished && (this.isPaused ? this.generatedError = e2 : (this.isFinished = true, this.emit("error", e2), this.previous && this.previous.error(e2), this.cleanUp()), true);
          }, on: function(e2, t2) {
            return this._listeners[e2].push(t2), this;
          }, cleanUp: function() {
            this.streamInfo = this.generatedError = this.extraStreamInfo = null, this._listeners = [];
          }, emit: function(e2, t2) {
            if (this._listeners[e2]) for (var r2 = 0; r2 < this._listeners[e2].length; r2++) this._listeners[e2][r2].call(this, t2);
          }, pipe: function(e2) {
            return e2.registerPrevious(this);
          }, registerPrevious: function(e2) {
            if (this.isLocked) throw new Error("The stream '" + this + "' has already been used.");
            this.streamInfo = e2.streamInfo, this.mergeStreamInfo(), this.previous = e2;
            var t2 = this;
            return e2.on("data", function(e3) {
              t2.processChunk(e3);
            }), e2.on("end", function() {
              t2.end();
            }), e2.on("error", function(e3) {
              t2.error(e3);
            }), this;
          }, pause: function() {
            return !this.isPaused && !this.isFinished && (this.isPaused = true, this.previous && this.previous.pause(), true);
          }, resume: function() {
            if (!this.isPaused || this.isFinished) return false;
            var e2 = this.isPaused = false;
            return this.generatedError && (this.error(this.generatedError), e2 = true), this.previous && this.previous.resume(), !e2;
          }, flush: function() {
          }, processChunk: function(e2) {
            this.push(e2);
          }, withStreamInfo: function(e2, t2) {
            return this.extraStreamInfo[e2] = t2, this.mergeStreamInfo(), this;
          }, mergeStreamInfo: function() {
            for (var e2 in this.extraStreamInfo) Object.prototype.hasOwnProperty.call(this.extraStreamInfo, e2) && (this.streamInfo[e2] = this.extraStreamInfo[e2]);
          }, lock: function() {
            if (this.isLocked) throw new Error("The stream '" + this + "' has already been used.");
            this.isLocked = true, this.previous && this.previous.lock();
          }, toString: function() {
            var e2 = "Worker " + this.name;
            return this.previous ? this.previous + " -> " + e2 : e2;
          } }, t.exports = n;
        }, {}], 29: [function(e, t, r) {
          "use strict";
          var h = e("../utils"), i = e("./ConvertWorker"), s = e("./GenericWorker"), u = e("../base64"), n = e("../support"), a = e("../external"), o = null;
          if (n.nodestream) try {
            o = e("../nodejs/NodejsStreamOutputAdapter");
          } catch (e2) {
          }
          function l(e2, o2) {
            return new a.Promise(function(t2, r2) {
              var n2 = [], i2 = e2._internalType, s2 = e2._outputType, a2 = e2._mimeType;
              e2.on("data", function(e3, t3) {
                n2.push(e3), o2 && o2(t3);
              }).on("error", function(e3) {
                n2 = [], r2(e3);
              }).on("end", function() {
                try {
                  var e3 = function(e4, t3, r3) {
                    switch (e4) {
                      case "blob":
                        return h.newBlob(h.transformTo("arraybuffer", t3), r3);
                      case "base64":
                        return u.encode(t3);
                      default:
                        return h.transformTo(e4, t3);
                    }
                  }(s2, function(e4, t3) {
                    var r3, n3 = 0, i3 = null, s3 = 0;
                    for (r3 = 0; r3 < t3.length; r3++) s3 += t3[r3].length;
                    switch (e4) {
                      case "string":
                        return t3.join("");
                      case "array":
                        return Array.prototype.concat.apply([], t3);
                      case "uint8array":
                        for (i3 = new Uint8Array(s3), r3 = 0; r3 < t3.length; r3++) i3.set(t3[r3], n3), n3 += t3[r3].length;
                        return i3;
                      case "nodebuffer":
                        return Buffer.concat(t3);
                      default:
                        throw new Error("concat : unsupported type '" + e4 + "'");
                    }
                  }(i2, n2), a2);
                  t2(e3);
                } catch (e4) {
                  r2(e4);
                }
                n2 = [];
              }).resume();
            });
          }
          function f(e2, t2, r2) {
            var n2 = t2;
            switch (t2) {
              case "blob":
              case "arraybuffer":
                n2 = "uint8array";
                break;
              case "base64":
                n2 = "string";
            }
            try {
              this._internalType = n2, this._outputType = t2, this._mimeType = r2, h.checkSupport(n2), this._worker = e2.pipe(new i(n2)), e2.lock();
            } catch (e3) {
              this._worker = new s("error"), this._worker.error(e3);
            }
          }
          f.prototype = { accumulate: function(e2) {
            return l(this, e2);
          }, on: function(e2, t2) {
            var r2 = this;
            return "data" === e2 ? this._worker.on(e2, function(e3) {
              t2.call(r2, e3.data, e3.meta);
            }) : this._worker.on(e2, function() {
              h.delay(t2, arguments, r2);
            }), this;
          }, resume: function() {
            return h.delay(this._worker.resume, [], this._worker), this;
          }, pause: function() {
            return this._worker.pause(), this;
          }, toNodejsStream: function(e2) {
            if (h.checkSupport("nodestream"), "nodebuffer" !== this._outputType) throw new Error(this._outputType + " is not supported by this method");
            return new o(this, { objectMode: "nodebuffer" !== this._outputType }, e2);
          } }, t.exports = f;
        }, { "../base64": 1, "../external": 6, "../nodejs/NodejsStreamOutputAdapter": 13, "../support": 30, "../utils": 32, "./ConvertWorker": 24, "./GenericWorker": 28 }], 30: [function(e, t, r) {
          "use strict";
          if (r.base64 = true, r.array = true, r.string = true, r.arraybuffer = "undefined" != typeof ArrayBuffer && "undefined" != typeof Uint8Array, r.nodebuffer = "undefined" != typeof Buffer, r.uint8array = "undefined" != typeof Uint8Array, "undefined" == typeof ArrayBuffer) r.blob = false;
          else {
            var n = new ArrayBuffer(0);
            try {
              r.blob = 0 === new Blob([n], { type: "application/zip" }).size;
            } catch (e2) {
              try {
                var i = new (self.BlobBuilder || self.WebKitBlobBuilder || self.MozBlobBuilder || self.MSBlobBuilder)();
                i.append(n), r.blob = 0 === i.getBlob("application/zip").size;
              } catch (e3) {
                r.blob = false;
              }
            }
          }
          try {
            r.nodestream = !!e("readable-stream").Readable;
          } catch (e2) {
            r.nodestream = false;
          }
        }, { "readable-stream": 16 }], 31: [function(e, t, s) {
          "use strict";
          for (var o = e("./utils"), h = e("./support"), r = e("./nodejsUtils"), n = e("./stream/GenericWorker"), u = new Array(256), i = 0; i < 256; i++) u[i] = 252 <= i ? 6 : 248 <= i ? 5 : 240 <= i ? 4 : 224 <= i ? 3 : 192 <= i ? 2 : 1;
          u[254] = u[254] = 1;
          function a() {
            n.call(this, "utf-8 decode"), this.leftOver = null;
          }
          function l() {
            n.call(this, "utf-8 encode");
          }
          s.utf8encode = function(e2) {
            return h.nodebuffer ? r.newBufferFrom(e2, "utf-8") : function(e3) {
              var t2, r2, n2, i2, s2, a2 = e3.length, o2 = 0;
              for (i2 = 0; i2 < a2; i2++) 55296 == (64512 & (r2 = e3.charCodeAt(i2))) && i2 + 1 < a2 && 56320 == (64512 & (n2 = e3.charCodeAt(i2 + 1))) && (r2 = 65536 + (r2 - 55296 << 10) + (n2 - 56320), i2++), o2 += r2 < 128 ? 1 : r2 < 2048 ? 2 : r2 < 65536 ? 3 : 4;
              for (t2 = h.uint8array ? new Uint8Array(o2) : new Array(o2), i2 = s2 = 0; s2 < o2; i2++) 55296 == (64512 & (r2 = e3.charCodeAt(i2))) && i2 + 1 < a2 && 56320 == (64512 & (n2 = e3.charCodeAt(i2 + 1))) && (r2 = 65536 + (r2 - 55296 << 10) + (n2 - 56320), i2++), r2 < 128 ? t2[s2++] = r2 : (r2 < 2048 ? t2[s2++] = 192 | r2 >>> 6 : (r2 < 65536 ? t2[s2++] = 224 | r2 >>> 12 : (t2[s2++] = 240 | r2 >>> 18, t2[s2++] = 128 | r2 >>> 12 & 63), t2[s2++] = 128 | r2 >>> 6 & 63), t2[s2++] = 128 | 63 & r2);
              return t2;
            }(e2);
          }, s.utf8decode = function(e2) {
            return h.nodebuffer ? o.transformTo("nodebuffer", e2).toString("utf-8") : function(e3) {
              var t2, r2, n2, i2, s2 = e3.length, a2 = new Array(2 * s2);
              for (t2 = r2 = 0; t2 < s2; ) if ((n2 = e3[t2++]) < 128) a2[r2++] = n2;
              else if (4 < (i2 = u[n2])) a2[r2++] = 65533, t2 += i2 - 1;
              else {
                for (n2 &= 2 === i2 ? 31 : 3 === i2 ? 15 : 7; 1 < i2 && t2 < s2; ) n2 = n2 << 6 | 63 & e3[t2++], i2--;
                1 < i2 ? a2[r2++] = 65533 : n2 < 65536 ? a2[r2++] = n2 : (n2 -= 65536, a2[r2++] = 55296 | n2 >> 10 & 1023, a2[r2++] = 56320 | 1023 & n2);
              }
              return a2.length !== r2 && (a2.subarray ? a2 = a2.subarray(0, r2) : a2.length = r2), o.applyFromCharCode(a2);
            }(e2 = o.transformTo(h.uint8array ? "uint8array" : "array", e2));
          }, o.inherits(a, n), a.prototype.processChunk = function(e2) {
            var t2 = o.transformTo(h.uint8array ? "uint8array" : "array", e2.data);
            if (this.leftOver && this.leftOver.length) {
              if (h.uint8array) {
                var r2 = t2;
                (t2 = new Uint8Array(r2.length + this.leftOver.length)).set(this.leftOver, 0), t2.set(r2, this.leftOver.length);
              } else t2 = this.leftOver.concat(t2);
              this.leftOver = null;
            }
            var n2 = function(e3, t3) {
              var r3;
              for ((t3 = t3 || e3.length) > e3.length && (t3 = e3.length), r3 = t3 - 1; 0 <= r3 && 128 == (192 & e3[r3]); ) r3--;
              return r3 < 0 ? t3 : 0 === r3 ? t3 : r3 + u[e3[r3]] > t3 ? r3 : t3;
            }(t2), i2 = t2;
            n2 !== t2.length && (h.uint8array ? (i2 = t2.subarray(0, n2), this.leftOver = t2.subarray(n2, t2.length)) : (i2 = t2.slice(0, n2), this.leftOver = t2.slice(n2, t2.length))), this.push({ data: s.utf8decode(i2), meta: e2.meta });
          }, a.prototype.flush = function() {
            this.leftOver && this.leftOver.length && (this.push({ data: s.utf8decode(this.leftOver), meta: {} }), this.leftOver = null);
          }, s.Utf8DecodeWorker = a, o.inherits(l, n), l.prototype.processChunk = function(e2) {
            this.push({ data: s.utf8encode(e2.data), meta: e2.meta });
          }, s.Utf8EncodeWorker = l;
        }, { "./nodejsUtils": 14, "./stream/GenericWorker": 28, "./support": 30, "./utils": 32 }], 32: [function(e, t, a) {
          "use strict";
          var o = e("./support"), h = e("./base64"), r = e("./nodejsUtils"), u = e("./external");
          function n(e2) {
            return e2;
          }
          function l(e2, t2) {
            for (var r2 = 0; r2 < e2.length; ++r2) t2[r2] = 255 & e2.charCodeAt(r2);
            return t2;
          }
          e("setimmediate"), a.newBlob = function(t2, r2) {
            a.checkSupport("blob");
            try {
              return new Blob([t2], { type: r2 });
            } catch (e2) {
              try {
                var n2 = new (self.BlobBuilder || self.WebKitBlobBuilder || self.MozBlobBuilder || self.MSBlobBuilder)();
                return n2.append(t2), n2.getBlob(r2);
              } catch (e3) {
                throw new Error("Bug : can't construct the Blob.");
              }
            }
          };
          var i = { stringifyByChunk: function(e2, t2, r2) {
            var n2 = [], i2 = 0, s2 = e2.length;
            if (s2 <= r2) return String.fromCharCode.apply(null, e2);
            for (; i2 < s2; ) "array" === t2 || "nodebuffer" === t2 ? n2.push(String.fromCharCode.apply(null, e2.slice(i2, Math.min(i2 + r2, s2)))) : n2.push(String.fromCharCode.apply(null, e2.subarray(i2, Math.min(i2 + r2, s2)))), i2 += r2;
            return n2.join("");
          }, stringifyByChar: function(e2) {
            for (var t2 = "", r2 = 0; r2 < e2.length; r2++) t2 += String.fromCharCode(e2[r2]);
            return t2;
          }, applyCanBeUsed: { uint8array: function() {
            try {
              return o.uint8array && 1 === String.fromCharCode.apply(null, new Uint8Array(1)).length;
            } catch (e2) {
              return false;
            }
          }(), nodebuffer: function() {
            try {
              return o.nodebuffer && 1 === String.fromCharCode.apply(null, r.allocBuffer(1)).length;
            } catch (e2) {
              return false;
            }
          }() } };
          function s(e2) {
            var t2 = 65536, r2 = a.getTypeOf(e2), n2 = true;
            if ("uint8array" === r2 ? n2 = i.applyCanBeUsed.uint8array : "nodebuffer" === r2 && (n2 = i.applyCanBeUsed.nodebuffer), n2) for (; 1 < t2; ) try {
              return i.stringifyByChunk(e2, r2, t2);
            } catch (e3) {
              t2 = Math.floor(t2 / 2);
            }
            return i.stringifyByChar(e2);
          }
          function f(e2, t2) {
            for (var r2 = 0; r2 < e2.length; r2++) t2[r2] = e2[r2];
            return t2;
          }
          a.applyFromCharCode = s;
          var c = {};
          c.string = { string: n, array: function(e2) {
            return l(e2, new Array(e2.length));
          }, arraybuffer: function(e2) {
            return c.string.uint8array(e2).buffer;
          }, uint8array: function(e2) {
            return l(e2, new Uint8Array(e2.length));
          }, nodebuffer: function(e2) {
            return l(e2, r.allocBuffer(e2.length));
          } }, c.array = { string: s, array: n, arraybuffer: function(e2) {
            return new Uint8Array(e2).buffer;
          }, uint8array: function(e2) {
            return new Uint8Array(e2);
          }, nodebuffer: function(e2) {
            return r.newBufferFrom(e2);
          } }, c.arraybuffer = { string: function(e2) {
            return s(new Uint8Array(e2));
          }, array: function(e2) {
            return f(new Uint8Array(e2), new Array(e2.byteLength));
          }, arraybuffer: n, uint8array: function(e2) {
            return new Uint8Array(e2);
          }, nodebuffer: function(e2) {
            return r.newBufferFrom(new Uint8Array(e2));
          } }, c.uint8array = { string: s, array: function(e2) {
            return f(e2, new Array(e2.length));
          }, arraybuffer: function(e2) {
            return e2.buffer;
          }, uint8array: n, nodebuffer: function(e2) {
            return r.newBufferFrom(e2);
          } }, c.nodebuffer = { string: s, array: function(e2) {
            return f(e2, new Array(e2.length));
          }, arraybuffer: function(e2) {
            return c.nodebuffer.uint8array(e2).buffer;
          }, uint8array: function(e2) {
            return f(e2, new Uint8Array(e2.length));
          }, nodebuffer: n }, a.transformTo = function(e2, t2) {
            if (t2 = t2 || "", !e2) return t2;
            a.checkSupport(e2);
            var r2 = a.getTypeOf(t2);
            return c[r2][e2](t2);
          }, a.resolve = function(e2) {
            for (var t2 = e2.split("/"), r2 = [], n2 = 0; n2 < t2.length; n2++) {
              var i2 = t2[n2];
              "." === i2 || "" === i2 && 0 !== n2 && n2 !== t2.length - 1 || (".." === i2 ? r2.pop() : r2.push(i2));
            }
            return r2.join("/");
          }, a.getTypeOf = function(e2) {
            if ("string" == typeof e2) return "string";
            var t2 = Object.prototype.toString.call(e2);
            return "[object Array]" === t2 ? "array" : o.nodebuffer && r.isBuffer(e2) ? "nodebuffer" : o.uint8array && "[object Uint8Array]" === t2 ? "uint8array" : o.arraybuffer && "[object ArrayBuffer]" === t2 ? "arraybuffer" : void 0;
          }, a.checkSupport = function(e2) {
            if (!o[e2.toLowerCase()]) throw new Error(e2 + " is not supported by this platform");
          }, a.MAX_VALUE_16BITS = 65535, a.MAX_VALUE_32BITS = -1, a.pretty = function(e2) {
            var t2, r2, n2 = "";
            for (r2 = 0; r2 < (e2 || "").length; r2++) n2 += "\\x" + ((t2 = e2.charCodeAt(r2)) < 16 ? "0" : "") + t2.toString(16).toUpperCase();
            return n2;
          }, a.delay = function(e2, t2, r2) {
            setImmediate(function() {
              e2.apply(r2 || null, t2 || []);
            });
          }, a.inherits = function(e2, t2) {
            function r2() {
            }
            r2.prototype = t2.prototype, e2.prototype = new r2();
          }, a.extend = function() {
            var e2, t2, r2 = {};
            for (e2 = 0; e2 < arguments.length; e2++) for (t2 in arguments[e2]) Object.prototype.hasOwnProperty.call(arguments[e2], t2) && void 0 === r2[t2] && (r2[t2] = arguments[e2][t2]);
            return r2;
          }, a.prepareContent = function(r2, e2, n2, i2, s2) {
            return u.Promise.resolve(e2).then(function(n3) {
              return o.blob && (n3 instanceof Blob || -1 !== ["[object File]", "[object Blob]"].indexOf(Object.prototype.toString.call(n3))) ? void 0 !== Blob.prototype.arrayBuffer ? n3.arrayBuffer() : "undefined" != typeof FileReader ? new u.Promise(function(t2, r3) {
                var e3 = new FileReader();
                e3.onload = function(e4) {
                  t2(e4.target.result);
                }, e3.onerror = function(e4) {
                  r3(e4.target.error);
                }, e3.readAsArrayBuffer(n3);
              }) : u.Promise.reject(new Error(r2 + " is a Blob, but we have no way of reading it.")) : n3;
            }).then(function(e3) {
              var t2 = a.getTypeOf(e3);
              return t2 ? ("arraybuffer" === t2 ? e3 = a.transformTo("uint8array", e3) : "string" === t2 && (s2 ? e3 = h.decode(e3) : n2 && true !== i2 && (e3 = function(e4) {
                return l(e4, o.uint8array ? new Uint8Array(e4.length) : new Array(e4.length));
              }(e3))), e3) : u.Promise.reject(new Error("Can't read the data of '" + r2 + "'. Is it in a supported JavaScript type (String, Blob, ArrayBuffer, etc) ?"));
            });
          };
        }, { "./base64": 1, "./external": 6, "./nodejsUtils": 14, "./support": 30, setimmediate: 54 }], 33: [function(e, t, r) {
          "use strict";
          var n = e("./reader/readerFor"), i = e("./utils"), s = e("./signature"), a = e("./zipEntry"), o = e("./support");
          function h(e2) {
            this.files = [], this.loadOptions = e2;
          }
          h.prototype = { checkSignature: function(e2) {
            if (!this.reader.readAndCheckSignature(e2)) {
              this.reader.index -= 4;
              var t2 = this.reader.readString(4);
              throw new Error("Corrupted zip or bug: unexpected signature (" + i.pretty(t2) + ", expected " + i.pretty(e2) + ")");
            }
          }, isSignature: function(e2, t2) {
            var r2 = this.reader.index;
            this.reader.setIndex(e2);
            var n2 = this.reader.readString(4) === t2;
            return this.reader.setIndex(r2), n2;
          }, readBlockEndOfCentral: function() {
            this.diskNumber = this.reader.readInt(2), this.diskWithCentralDirStart = this.reader.readInt(2), this.centralDirRecordsOnThisDisk = this.reader.readInt(2), this.centralDirRecords = this.reader.readInt(2), this.centralDirSize = this.reader.readInt(4), this.centralDirOffset = this.reader.readInt(4), this.zipCommentLength = this.reader.readInt(2);
            var e2 = this.reader.readData(this.zipCommentLength), t2 = o.uint8array ? "uint8array" : "array", r2 = i.transformTo(t2, e2);
            this.zipComment = this.loadOptions.decodeFileName(r2);
          }, readBlockZip64EndOfCentral: function() {
            this.zip64EndOfCentralSize = this.reader.readInt(8), this.reader.skip(4), this.diskNumber = this.reader.readInt(4), this.diskWithCentralDirStart = this.reader.readInt(4), this.centralDirRecordsOnThisDisk = this.reader.readInt(8), this.centralDirRecords = this.reader.readInt(8), this.centralDirSize = this.reader.readInt(8), this.centralDirOffset = this.reader.readInt(8), this.zip64ExtensibleData = {};
            for (var e2, t2, r2, n2 = this.zip64EndOfCentralSize - 44; 0 < n2; ) e2 = this.reader.readInt(2), t2 = this.reader.readInt(4), r2 = this.reader.readData(t2), this.zip64ExtensibleData[e2] = { id: e2, length: t2, value: r2 };
          }, readBlockZip64EndOfCentralLocator: function() {
            if (this.diskWithZip64CentralDirStart = this.reader.readInt(4), this.relativeOffsetEndOfZip64CentralDir = this.reader.readInt(8), this.disksCount = this.reader.readInt(4), 1 < this.disksCount) throw new Error("Multi-volumes zip are not supported");
          }, readLocalFiles: function() {
            var e2, t2;
            for (e2 = 0; e2 < this.files.length; e2++) t2 = this.files[e2], this.reader.setIndex(t2.localHeaderOffset), this.checkSignature(s.LOCAL_FILE_HEADER), t2.readLocalPart(this.reader), t2.handleUTF8(), t2.processAttributes();
          }, readCentralDir: function() {
            var e2;
            for (this.reader.setIndex(this.centralDirOffset); this.reader.readAndCheckSignature(s.CENTRAL_FILE_HEADER); ) (e2 = new a({ zip64: this.zip64 }, this.loadOptions)).readCentralPart(this.reader), this.files.push(e2);
            if (this.centralDirRecords !== this.files.length && 0 !== this.centralDirRecords && 0 === this.files.length) throw new Error("Corrupted zip or bug: expected " + this.centralDirRecords + " records in central dir, got " + this.files.length);
          }, readEndOfCentral: function() {
            var e2 = this.reader.lastIndexOfSignature(s.CENTRAL_DIRECTORY_END);
            if (e2 < 0) throw !this.isSignature(0, s.LOCAL_FILE_HEADER) ? new Error("Can't find end of central directory : is this a zip file ? If it is, see https://stuk.github.io/jszip/documentation/howto/read_zip.html") : new Error("Corrupted zip: can't find end of central directory");
            this.reader.setIndex(e2);
            var t2 = e2;
            if (this.checkSignature(s.CENTRAL_DIRECTORY_END), this.readBlockEndOfCentral(), this.diskNumber === i.MAX_VALUE_16BITS || this.diskWithCentralDirStart === i.MAX_VALUE_16BITS || this.centralDirRecordsOnThisDisk === i.MAX_VALUE_16BITS || this.centralDirRecords === i.MAX_VALUE_16BITS || this.centralDirSize === i.MAX_VALUE_32BITS || this.centralDirOffset === i.MAX_VALUE_32BITS) {
              if (this.zip64 = true, (e2 = this.reader.lastIndexOfSignature(s.ZIP64_CENTRAL_DIRECTORY_LOCATOR)) < 0) throw new Error("Corrupted zip: can't find the ZIP64 end of central directory locator");
              if (this.reader.setIndex(e2), this.checkSignature(s.ZIP64_CENTRAL_DIRECTORY_LOCATOR), this.readBlockZip64EndOfCentralLocator(), !this.isSignature(this.relativeOffsetEndOfZip64CentralDir, s.ZIP64_CENTRAL_DIRECTORY_END) && (this.relativeOffsetEndOfZip64CentralDir = this.reader.lastIndexOfSignature(s.ZIP64_CENTRAL_DIRECTORY_END), this.relativeOffsetEndOfZip64CentralDir < 0)) throw new Error("Corrupted zip: can't find the ZIP64 end of central directory");
              this.reader.setIndex(this.relativeOffsetEndOfZip64CentralDir), this.checkSignature(s.ZIP64_CENTRAL_DIRECTORY_END), this.readBlockZip64EndOfCentral();
            }
            var r2 = this.centralDirOffset + this.centralDirSize;
            this.zip64 && (r2 += 20, r2 += 12 + this.zip64EndOfCentralSize);
            var n2 = t2 - r2;
            if (0 < n2) this.isSignature(t2, s.CENTRAL_FILE_HEADER) || (this.reader.zero = n2);
            else if (n2 < 0) throw new Error("Corrupted zip: missing " + Math.abs(n2) + " bytes.");
          }, prepareReader: function(e2) {
            this.reader = n(e2);
          }, load: function(e2) {
            this.prepareReader(e2), this.readEndOfCentral(), this.readCentralDir(), this.readLocalFiles();
          } }, t.exports = h;
        }, { "./reader/readerFor": 22, "./signature": 23, "./support": 30, "./utils": 32, "./zipEntry": 34 }], 34: [function(e, t, r) {
          "use strict";
          var n = e("./reader/readerFor"), s = e("./utils"), i = e("./compressedObject"), a = e("./crc32"), o = e("./utf8"), h = e("./compressions"), u = e("./support");
          function l(e2, t2) {
            this.options = e2, this.loadOptions = t2;
          }
          l.prototype = { isEncrypted: function() {
            return 1 == (1 & this.bitFlag);
          }, useUTF8: function() {
            return 2048 == (2048 & this.bitFlag);
          }, readLocalPart: function(e2) {
            var t2, r2;
            if (e2.skip(22), this.fileNameLength = e2.readInt(2), r2 = e2.readInt(2), this.fileName = e2.readData(this.fileNameLength), e2.skip(r2), -1 === this.compressedSize || -1 === this.uncompressedSize) throw new Error("Bug or corrupted zip : didn't get enough information from the central directory (compressedSize === -1 || uncompressedSize === -1)");
            if (null === (t2 = function(e3) {
              for (var t3 in h) if (Object.prototype.hasOwnProperty.call(h, t3) && h[t3].magic === e3) return h[t3];
              return null;
            }(this.compressionMethod))) throw new Error("Corrupted zip : compression " + s.pretty(this.compressionMethod) + " unknown (inner file : " + s.transformTo("string", this.fileName) + ")");
            this.decompressed = new i(this.compressedSize, this.uncompressedSize, this.crc32, t2, e2.readData(this.compressedSize));
          }, readCentralPart: function(e2) {
            this.versionMadeBy = e2.readInt(2), e2.skip(2), this.bitFlag = e2.readInt(2), this.compressionMethod = e2.readString(2), this.date = e2.readDate(), this.crc32 = e2.readInt(4), this.compressedSize = e2.readInt(4), this.uncompressedSize = e2.readInt(4);
            var t2 = e2.readInt(2);
            if (this.extraFieldsLength = e2.readInt(2), this.fileCommentLength = e2.readInt(2), this.diskNumberStart = e2.readInt(2), this.internalFileAttributes = e2.readInt(2), this.externalFileAttributes = e2.readInt(4), this.localHeaderOffset = e2.readInt(4), this.isEncrypted()) throw new Error("Encrypted zip are not supported");
            e2.skip(t2), this.readExtraFields(e2), this.parseZIP64ExtraField(e2), this.fileComment = e2.readData(this.fileCommentLength);
          }, processAttributes: function() {
            this.unixPermissions = null, this.dosPermissions = null;
            var e2 = this.versionMadeBy >> 8;
            this.dir = !!(16 & this.externalFileAttributes), 0 == e2 && (this.dosPermissions = 63 & this.externalFileAttributes), 3 == e2 && (this.unixPermissions = this.externalFileAttributes >> 16 & 65535), this.dir || "/" !== this.fileNameStr.slice(-1) || (this.dir = true);
          }, parseZIP64ExtraField: function() {
            if (this.extraFields[1]) {
              var e2 = n(this.extraFields[1].value);
              this.uncompressedSize === s.MAX_VALUE_32BITS && (this.uncompressedSize = e2.readInt(8)), this.compressedSize === s.MAX_VALUE_32BITS && (this.compressedSize = e2.readInt(8)), this.localHeaderOffset === s.MAX_VALUE_32BITS && (this.localHeaderOffset = e2.readInt(8)), this.diskNumberStart === s.MAX_VALUE_32BITS && (this.diskNumberStart = e2.readInt(4));
            }
          }, readExtraFields: function(e2) {
            var t2, r2, n2, i2 = e2.index + this.extraFieldsLength;
            for (this.extraFields || (this.extraFields = {}); e2.index + 4 < i2; ) t2 = e2.readInt(2), r2 = e2.readInt(2), n2 = e2.readData(r2), this.extraFields[t2] = { id: t2, length: r2, value: n2 };
            e2.setIndex(i2);
          }, handleUTF8: function() {
            var e2 = u.uint8array ? "uint8array" : "array";
            if (this.useUTF8()) this.fileNameStr = o.utf8decode(this.fileName), this.fileCommentStr = o.utf8decode(this.fileComment);
            else {
              var t2 = this.findExtraFieldUnicodePath();
              if (null !== t2) this.fileNameStr = t2;
              else {
                var r2 = s.transformTo(e2, this.fileName);
                this.fileNameStr = this.loadOptions.decodeFileName(r2);
              }
              var n2 = this.findExtraFieldUnicodeComment();
              if (null !== n2) this.fileCommentStr = n2;
              else {
                var i2 = s.transformTo(e2, this.fileComment);
                this.fileCommentStr = this.loadOptions.decodeFileName(i2);
              }
            }
          }, findExtraFieldUnicodePath: function() {
            var e2 = this.extraFields[28789];
            if (e2) {
              var t2 = n(e2.value);
              return 1 !== t2.readInt(1) ? null : a(this.fileName) !== t2.readInt(4) ? null : o.utf8decode(t2.readData(e2.length - 5));
            }
            return null;
          }, findExtraFieldUnicodeComment: function() {
            var e2 = this.extraFields[25461];
            if (e2) {
              var t2 = n(e2.value);
              return 1 !== t2.readInt(1) ? null : a(this.fileComment) !== t2.readInt(4) ? null : o.utf8decode(t2.readData(e2.length - 5));
            }
            return null;
          } }, t.exports = l;
        }, { "./compressedObject": 2, "./compressions": 3, "./crc32": 4, "./reader/readerFor": 22, "./support": 30, "./utf8": 31, "./utils": 32 }], 35: [function(e, t, r) {
          "use strict";
          function n(e2, t2, r2) {
            this.name = e2, this.dir = r2.dir, this.date = r2.date, this.comment = r2.comment, this.unixPermissions = r2.unixPermissions, this.dosPermissions = r2.dosPermissions, this._data = t2, this._dataBinary = r2.binary, this.options = { compression: r2.compression, compressionOptions: r2.compressionOptions };
          }
          var s = e("./stream/StreamHelper"), i = e("./stream/DataWorker"), a = e("./utf8"), o = e("./compressedObject"), h = e("./stream/GenericWorker");
          n.prototype = { internalStream: function(e2) {
            var t2 = null, r2 = "string";
            try {
              if (!e2) throw new Error("No output type specified.");
              var n2 = "string" === (r2 = e2.toLowerCase()) || "text" === r2;
              "binarystring" !== r2 && "text" !== r2 || (r2 = "string"), t2 = this._decompressWorker();
              var i2 = !this._dataBinary;
              i2 && !n2 && (t2 = t2.pipe(new a.Utf8EncodeWorker())), !i2 && n2 && (t2 = t2.pipe(new a.Utf8DecodeWorker()));
            } catch (e3) {
              (t2 = new h("error")).error(e3);
            }
            return new s(t2, r2, "");
          }, async: function(e2, t2) {
            return this.internalStream(e2).accumulate(t2);
          }, nodeStream: function(e2, t2) {
            return this.internalStream(e2 || "nodebuffer").toNodejsStream(t2);
          }, _compressWorker: function(e2, t2) {
            if (this._data instanceof o && this._data.compression.magic === e2.magic) return this._data.getCompressedWorker();
            var r2 = this._decompressWorker();
            return this._dataBinary || (r2 = r2.pipe(new a.Utf8EncodeWorker())), o.createWorkerFrom(r2, e2, t2);
          }, _decompressWorker: function() {
            return this._data instanceof o ? this._data.getContentWorker() : this._data instanceof h ? this._data : new i(this._data);
          } };
          for (var u = ["asText", "asBinary", "asNodeBuffer", "asUint8Array", "asArrayBuffer"], l = function() {
            throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
          }, f = 0; f < u.length; f++) n.prototype[u[f]] = l;
          t.exports = n;
        }, { "./compressedObject": 2, "./stream/DataWorker": 27, "./stream/GenericWorker": 28, "./stream/StreamHelper": 29, "./utf8": 31 }], 36: [function(e, l, t) {
          (function(t2) {
            "use strict";
            var r, n, e2 = t2.MutationObserver || t2.WebKitMutationObserver;
            if (e2) {
              var i = 0, s = new e2(u), a = t2.document.createTextNode("");
              s.observe(a, { characterData: true }), r = function() {
                a.data = i = ++i % 2;
              };
            } else if (t2.setImmediate || void 0 === t2.MessageChannel) r = "document" in t2 && "onreadystatechange" in t2.document.createElement("script") ? function() {
              var e3 = t2.document.createElement("script");
              e3.onreadystatechange = function() {
                u(), e3.onreadystatechange = null, e3.parentNode.removeChild(e3), e3 = null;
              }, t2.document.documentElement.appendChild(e3);
            } : function() {
              setTimeout(u, 0);
            };
            else {
              var o = new t2.MessageChannel();
              o.port1.onmessage = u, r = function() {
                o.port2.postMessage(0);
              };
            }
            var h = [];
            function u() {
              var e3, t3;
              n = true;
              for (var r2 = h.length; r2; ) {
                for (t3 = h, h = [], e3 = -1; ++e3 < r2; ) t3[e3]();
                r2 = h.length;
              }
              n = false;
            }
            l.exports = function(e3) {
              1 !== h.push(e3) || n || r();
            };
          }).call(this, "undefined" != typeof global ? global : "undefined" != typeof self ? self : "undefined" != typeof window ? window : {});
        }, {}], 37: [function(e, t, r) {
          "use strict";
          var i = e("immediate");
          function u() {
          }
          var l = {}, s = ["REJECTED"], a = ["FULFILLED"], n = ["PENDING"];
          function o(e2) {
            if ("function" != typeof e2) throw new TypeError("resolver must be a function");
            this.state = n, this.queue = [], this.outcome = void 0, e2 !== u && d(this, e2);
          }
          function h(e2, t2, r2) {
            this.promise = e2, "function" == typeof t2 && (this.onFulfilled = t2, this.callFulfilled = this.otherCallFulfilled), "function" == typeof r2 && (this.onRejected = r2, this.callRejected = this.otherCallRejected);
          }
          function f(t2, r2, n2) {
            i(function() {
              var e2;
              try {
                e2 = r2(n2);
              } catch (e3) {
                return l.reject(t2, e3);
              }
              e2 === t2 ? l.reject(t2, new TypeError("Cannot resolve promise with itself")) : l.resolve(t2, e2);
            });
          }
          function c(e2) {
            var t2 = e2 && e2.then;
            if (e2 && ("object" == typeof e2 || "function" == typeof e2) && "function" == typeof t2) return function() {
              t2.apply(e2, arguments);
            };
          }
          function d(t2, e2) {
            var r2 = false;
            function n2(e3) {
              r2 || (r2 = true, l.reject(t2, e3));
            }
            function i2(e3) {
              r2 || (r2 = true, l.resolve(t2, e3));
            }
            var s2 = p(function() {
              e2(i2, n2);
            });
            "error" === s2.status && n2(s2.value);
          }
          function p(e2, t2) {
            var r2 = {};
            try {
              r2.value = e2(t2), r2.status = "success";
            } catch (e3) {
              r2.status = "error", r2.value = e3;
            }
            return r2;
          }
          (t.exports = o).prototype.finally = function(t2) {
            if ("function" != typeof t2) return this;
            var r2 = this.constructor;
            return this.then(function(e2) {
              return r2.resolve(t2()).then(function() {
                return e2;
              });
            }, function(e2) {
              return r2.resolve(t2()).then(function() {
                throw e2;
              });
            });
          }, o.prototype.catch = function(e2) {
            return this.then(null, e2);
          }, o.prototype.then = function(e2, t2) {
            if ("function" != typeof e2 && this.state === a || "function" != typeof t2 && this.state === s) return this;
            var r2 = new this.constructor(u);
            this.state !== n ? f(r2, this.state === a ? e2 : t2, this.outcome) : this.queue.push(new h(r2, e2, t2));
            return r2;
          }, h.prototype.callFulfilled = function(e2) {
            l.resolve(this.promise, e2);
          }, h.prototype.otherCallFulfilled = function(e2) {
            f(this.promise, this.onFulfilled, e2);
          }, h.prototype.callRejected = function(e2) {
            l.reject(this.promise, e2);
          }, h.prototype.otherCallRejected = function(e2) {
            f(this.promise, this.onRejected, e2);
          }, l.resolve = function(e2, t2) {
            var r2 = p(c, t2);
            if ("error" === r2.status) return l.reject(e2, r2.value);
            var n2 = r2.value;
            if (n2) d(e2, n2);
            else {
              e2.state = a, e2.outcome = t2;
              for (var i2 = -1, s2 = e2.queue.length; ++i2 < s2; ) e2.queue[i2].callFulfilled(t2);
            }
            return e2;
          }, l.reject = function(e2, t2) {
            e2.state = s, e2.outcome = t2;
            for (var r2 = -1, n2 = e2.queue.length; ++r2 < n2; ) e2.queue[r2].callRejected(t2);
            return e2;
          }, o.resolve = function(e2) {
            if (e2 instanceof this) return e2;
            return l.resolve(new this(u), e2);
          }, o.reject = function(e2) {
            var t2 = new this(u);
            return l.reject(t2, e2);
          }, o.all = function(e2) {
            var r2 = this;
            if ("[object Array]" !== Object.prototype.toString.call(e2)) return this.reject(new TypeError("must be an array"));
            var n2 = e2.length, i2 = false;
            if (!n2) return this.resolve([]);
            var s2 = new Array(n2), a2 = 0, t2 = -1, o2 = new this(u);
            for (; ++t2 < n2; ) h2(e2[t2], t2);
            return o2;
            function h2(e3, t3) {
              r2.resolve(e3).then(function(e4) {
                s2[t3] = e4, ++a2 !== n2 || i2 || (i2 = true, l.resolve(o2, s2));
              }, function(e4) {
                i2 || (i2 = true, l.reject(o2, e4));
              });
            }
          }, o.race = function(e2) {
            var t2 = this;
            if ("[object Array]" !== Object.prototype.toString.call(e2)) return this.reject(new TypeError("must be an array"));
            var r2 = e2.length, n2 = false;
            if (!r2) return this.resolve([]);
            var i2 = -1, s2 = new this(u);
            for (; ++i2 < r2; ) a2 = e2[i2], t2.resolve(a2).then(function(e3) {
              n2 || (n2 = true, l.resolve(s2, e3));
            }, function(e3) {
              n2 || (n2 = true, l.reject(s2, e3));
            });
            var a2;
            return s2;
          };
        }, { immediate: 36 }], 38: [function(e, t, r) {
          "use strict";
          var n = {};
          (0, e("./lib/utils/common").assign)(n, e("./lib/deflate"), e("./lib/inflate"), e("./lib/zlib/constants")), t.exports = n;
        }, { "./lib/deflate": 39, "./lib/inflate": 40, "./lib/utils/common": 41, "./lib/zlib/constants": 44 }], 39: [function(e, t, r) {
          "use strict";
          var a = e("./zlib/deflate"), o = e("./utils/common"), h = e("./utils/strings"), i = e("./zlib/messages"), s = e("./zlib/zstream"), u = Object.prototype.toString, l = 0, f = -1, c = 0, d = 8;
          function p(e2) {
            if (!(this instanceof p)) return new p(e2);
            this.options = o.assign({ level: f, method: d, chunkSize: 16384, windowBits: 15, memLevel: 8, strategy: c, to: "" }, e2 || {});
            var t2 = this.options;
            t2.raw && 0 < t2.windowBits ? t2.windowBits = -t2.windowBits : t2.gzip && 0 < t2.windowBits && t2.windowBits < 16 && (t2.windowBits += 16), this.err = 0, this.msg = "", this.ended = false, this.chunks = [], this.strm = new s(), this.strm.avail_out = 0;
            var r2 = a.deflateInit2(this.strm, t2.level, t2.method, t2.windowBits, t2.memLevel, t2.strategy);
            if (r2 !== l) throw new Error(i[r2]);
            if (t2.header && a.deflateSetHeader(this.strm, t2.header), t2.dictionary) {
              var n2;
              if (n2 = "string" == typeof t2.dictionary ? h.string2buf(t2.dictionary) : "[object ArrayBuffer]" === u.call(t2.dictionary) ? new Uint8Array(t2.dictionary) : t2.dictionary, (r2 = a.deflateSetDictionary(this.strm, n2)) !== l) throw new Error(i[r2]);
              this._dict_set = true;
            }
          }
          function n(e2, t2) {
            var r2 = new p(t2);
            if (r2.push(e2, true), r2.err) throw r2.msg || i[r2.err];
            return r2.result;
          }
          p.prototype.push = function(e2, t2) {
            var r2, n2, i2 = this.strm, s2 = this.options.chunkSize;
            if (this.ended) return false;
            n2 = t2 === ~~t2 ? t2 : true === t2 ? 4 : 0, "string" == typeof e2 ? i2.input = h.string2buf(e2) : "[object ArrayBuffer]" === u.call(e2) ? i2.input = new Uint8Array(e2) : i2.input = e2, i2.next_in = 0, i2.avail_in = i2.input.length;
            do {
              if (0 === i2.avail_out && (i2.output = new o.Buf8(s2), i2.next_out = 0, i2.avail_out = s2), 1 !== (r2 = a.deflate(i2, n2)) && r2 !== l) return this.onEnd(r2), !(this.ended = true);
              0 !== i2.avail_out && (0 !== i2.avail_in || 4 !== n2 && 2 !== n2) || ("string" === this.options.to ? this.onData(h.buf2binstring(o.shrinkBuf(i2.output, i2.next_out))) : this.onData(o.shrinkBuf(i2.output, i2.next_out)));
            } while ((0 < i2.avail_in || 0 === i2.avail_out) && 1 !== r2);
            return 4 === n2 ? (r2 = a.deflateEnd(this.strm), this.onEnd(r2), this.ended = true, r2 === l) : 2 !== n2 || (this.onEnd(l), !(i2.avail_out = 0));
          }, p.prototype.onData = function(e2) {
            this.chunks.push(e2);
          }, p.prototype.onEnd = function(e2) {
            e2 === l && ("string" === this.options.to ? this.result = this.chunks.join("") : this.result = o.flattenChunks(this.chunks)), this.chunks = [], this.err = e2, this.msg = this.strm.msg;
          }, r.Deflate = p, r.deflate = n, r.deflateRaw = function(e2, t2) {
            return (t2 = t2 || {}).raw = true, n(e2, t2);
          }, r.gzip = function(e2, t2) {
            return (t2 = t2 || {}).gzip = true, n(e2, t2);
          };
        }, { "./utils/common": 41, "./utils/strings": 42, "./zlib/deflate": 46, "./zlib/messages": 51, "./zlib/zstream": 53 }], 40: [function(e, t, r) {
          "use strict";
          var c = e("./zlib/inflate"), d = e("./utils/common"), p = e("./utils/strings"), m = e("./zlib/constants"), n = e("./zlib/messages"), i = e("./zlib/zstream"), s = e("./zlib/gzheader"), _ = Object.prototype.toString;
          function a(e2) {
            if (!(this instanceof a)) return new a(e2);
            this.options = d.assign({ chunkSize: 16384, windowBits: 0, to: "" }, e2 || {});
            var t2 = this.options;
            t2.raw && 0 <= t2.windowBits && t2.windowBits < 16 && (t2.windowBits = -t2.windowBits, 0 === t2.windowBits && (t2.windowBits = -15)), !(0 <= t2.windowBits && t2.windowBits < 16) || e2 && e2.windowBits || (t2.windowBits += 32), 15 < t2.windowBits && t2.windowBits < 48 && 0 == (15 & t2.windowBits) && (t2.windowBits |= 15), this.err = 0, this.msg = "", this.ended = false, this.chunks = [], this.strm = new i(), this.strm.avail_out = 0;
            var r2 = c.inflateInit2(this.strm, t2.windowBits);
            if (r2 !== m.Z_OK) throw new Error(n[r2]);
            this.header = new s(), c.inflateGetHeader(this.strm, this.header);
          }
          function o(e2, t2) {
            var r2 = new a(t2);
            if (r2.push(e2, true), r2.err) throw r2.msg || n[r2.err];
            return r2.result;
          }
          a.prototype.push = function(e2, t2) {
            var r2, n2, i2, s2, a2, o2, h = this.strm, u = this.options.chunkSize, l = this.options.dictionary, f = false;
            if (this.ended) return false;
            n2 = t2 === ~~t2 ? t2 : true === t2 ? m.Z_FINISH : m.Z_NO_FLUSH, "string" == typeof e2 ? h.input = p.binstring2buf(e2) : "[object ArrayBuffer]" === _.call(e2) ? h.input = new Uint8Array(e2) : h.input = e2, h.next_in = 0, h.avail_in = h.input.length;
            do {
              if (0 === h.avail_out && (h.output = new d.Buf8(u), h.next_out = 0, h.avail_out = u), (r2 = c.inflate(h, m.Z_NO_FLUSH)) === m.Z_NEED_DICT && l && (o2 = "string" == typeof l ? p.string2buf(l) : "[object ArrayBuffer]" === _.call(l) ? new Uint8Array(l) : l, r2 = c.inflateSetDictionary(this.strm, o2)), r2 === m.Z_BUF_ERROR && true === f && (r2 = m.Z_OK, f = false), r2 !== m.Z_STREAM_END && r2 !== m.Z_OK) return this.onEnd(r2), !(this.ended = true);
              h.next_out && (0 !== h.avail_out && r2 !== m.Z_STREAM_END && (0 !== h.avail_in || n2 !== m.Z_FINISH && n2 !== m.Z_SYNC_FLUSH) || ("string" === this.options.to ? (i2 = p.utf8border(h.output, h.next_out), s2 = h.next_out - i2, a2 = p.buf2string(h.output, i2), h.next_out = s2, h.avail_out = u - s2, s2 && d.arraySet(h.output, h.output, i2, s2, 0), this.onData(a2)) : this.onData(d.shrinkBuf(h.output, h.next_out)))), 0 === h.avail_in && 0 === h.avail_out && (f = true);
            } while ((0 < h.avail_in || 0 === h.avail_out) && r2 !== m.Z_STREAM_END);
            return r2 === m.Z_STREAM_END && (n2 = m.Z_FINISH), n2 === m.Z_FINISH ? (r2 = c.inflateEnd(this.strm), this.onEnd(r2), this.ended = true, r2 === m.Z_OK) : n2 !== m.Z_SYNC_FLUSH || (this.onEnd(m.Z_OK), !(h.avail_out = 0));
          }, a.prototype.onData = function(e2) {
            this.chunks.push(e2);
          }, a.prototype.onEnd = function(e2) {
            e2 === m.Z_OK && ("string" === this.options.to ? this.result = this.chunks.join("") : this.result = d.flattenChunks(this.chunks)), this.chunks = [], this.err = e2, this.msg = this.strm.msg;
          }, r.Inflate = a, r.inflate = o, r.inflateRaw = function(e2, t2) {
            return (t2 = t2 || {}).raw = true, o(e2, t2);
          }, r.ungzip = o;
        }, { "./utils/common": 41, "./utils/strings": 42, "./zlib/constants": 44, "./zlib/gzheader": 47, "./zlib/inflate": 49, "./zlib/messages": 51, "./zlib/zstream": 53 }], 41: [function(e, t, r) {
          "use strict";
          var n = "undefined" != typeof Uint8Array && "undefined" != typeof Uint16Array && "undefined" != typeof Int32Array;
          r.assign = function(e2) {
            for (var t2 = Array.prototype.slice.call(arguments, 1); t2.length; ) {
              var r2 = t2.shift();
              if (r2) {
                if ("object" != typeof r2) throw new TypeError(r2 + "must be non-object");
                for (var n2 in r2) r2.hasOwnProperty(n2) && (e2[n2] = r2[n2]);
              }
            }
            return e2;
          }, r.shrinkBuf = function(e2, t2) {
            return e2.length === t2 ? e2 : e2.subarray ? e2.subarray(0, t2) : (e2.length = t2, e2);
          };
          var i = { arraySet: function(e2, t2, r2, n2, i2) {
            if (t2.subarray && e2.subarray) e2.set(t2.subarray(r2, r2 + n2), i2);
            else for (var s2 = 0; s2 < n2; s2++) e2[i2 + s2] = t2[r2 + s2];
          }, flattenChunks: function(e2) {
            var t2, r2, n2, i2, s2, a;
            for (t2 = n2 = 0, r2 = e2.length; t2 < r2; t2++) n2 += e2[t2].length;
            for (a = new Uint8Array(n2), t2 = i2 = 0, r2 = e2.length; t2 < r2; t2++) s2 = e2[t2], a.set(s2, i2), i2 += s2.length;
            return a;
          } }, s = { arraySet: function(e2, t2, r2, n2, i2) {
            for (var s2 = 0; s2 < n2; s2++) e2[i2 + s2] = t2[r2 + s2];
          }, flattenChunks: function(e2) {
            return [].concat.apply([], e2);
          } };
          r.setTyped = function(e2) {
            e2 ? (r.Buf8 = Uint8Array, r.Buf16 = Uint16Array, r.Buf32 = Int32Array, r.assign(r, i)) : (r.Buf8 = Array, r.Buf16 = Array, r.Buf32 = Array, r.assign(r, s));
          }, r.setTyped(n);
        }, {}], 42: [function(e, t, r) {
          "use strict";
          var h = e("./common"), i = true, s = true;
          try {
            String.fromCharCode.apply(null, [0]);
          } catch (e2) {
            i = false;
          }
          try {
            String.fromCharCode.apply(null, new Uint8Array(1));
          } catch (e2) {
            s = false;
          }
          for (var u = new h.Buf8(256), n = 0; n < 256; n++) u[n] = 252 <= n ? 6 : 248 <= n ? 5 : 240 <= n ? 4 : 224 <= n ? 3 : 192 <= n ? 2 : 1;
          function l(e2, t2) {
            if (t2 < 65537 && (e2.subarray && s || !e2.subarray && i)) return String.fromCharCode.apply(null, h.shrinkBuf(e2, t2));
            for (var r2 = "", n2 = 0; n2 < t2; n2++) r2 += String.fromCharCode(e2[n2]);
            return r2;
          }
          u[254] = u[254] = 1, r.string2buf = function(e2) {
            var t2, r2, n2, i2, s2, a = e2.length, o = 0;
            for (i2 = 0; i2 < a; i2++) 55296 == (64512 & (r2 = e2.charCodeAt(i2))) && i2 + 1 < a && 56320 == (64512 & (n2 = e2.charCodeAt(i2 + 1))) && (r2 = 65536 + (r2 - 55296 << 10) + (n2 - 56320), i2++), o += r2 < 128 ? 1 : r2 < 2048 ? 2 : r2 < 65536 ? 3 : 4;
            for (t2 = new h.Buf8(o), i2 = s2 = 0; s2 < o; i2++) 55296 == (64512 & (r2 = e2.charCodeAt(i2))) && i2 + 1 < a && 56320 == (64512 & (n2 = e2.charCodeAt(i2 + 1))) && (r2 = 65536 + (r2 - 55296 << 10) + (n2 - 56320), i2++), r2 < 128 ? t2[s2++] = r2 : (r2 < 2048 ? t2[s2++] = 192 | r2 >>> 6 : (r2 < 65536 ? t2[s2++] = 224 | r2 >>> 12 : (t2[s2++] = 240 | r2 >>> 18, t2[s2++] = 128 | r2 >>> 12 & 63), t2[s2++] = 128 | r2 >>> 6 & 63), t2[s2++] = 128 | 63 & r2);
            return t2;
          }, r.buf2binstring = function(e2) {
            return l(e2, e2.length);
          }, r.binstring2buf = function(e2) {
            for (var t2 = new h.Buf8(e2.length), r2 = 0, n2 = t2.length; r2 < n2; r2++) t2[r2] = e2.charCodeAt(r2);
            return t2;
          }, r.buf2string = function(e2, t2) {
            var r2, n2, i2, s2, a = t2 || e2.length, o = new Array(2 * a);
            for (r2 = n2 = 0; r2 < a; ) if ((i2 = e2[r2++]) < 128) o[n2++] = i2;
            else if (4 < (s2 = u[i2])) o[n2++] = 65533, r2 += s2 - 1;
            else {
              for (i2 &= 2 === s2 ? 31 : 3 === s2 ? 15 : 7; 1 < s2 && r2 < a; ) i2 = i2 << 6 | 63 & e2[r2++], s2--;
              1 < s2 ? o[n2++] = 65533 : i2 < 65536 ? o[n2++] = i2 : (i2 -= 65536, o[n2++] = 55296 | i2 >> 10 & 1023, o[n2++] = 56320 | 1023 & i2);
            }
            return l(o, n2);
          }, r.utf8border = function(e2, t2) {
            var r2;
            for ((t2 = t2 || e2.length) > e2.length && (t2 = e2.length), r2 = t2 - 1; 0 <= r2 && 128 == (192 & e2[r2]); ) r2--;
            return r2 < 0 ? t2 : 0 === r2 ? t2 : r2 + u[e2[r2]] > t2 ? r2 : t2;
          };
        }, { "./common": 41 }], 43: [function(e, t, r) {
          "use strict";
          t.exports = function(e2, t2, r2, n) {
            for (var i = 65535 & e2 | 0, s = e2 >>> 16 & 65535 | 0, a = 0; 0 !== r2; ) {
              for (r2 -= a = 2e3 < r2 ? 2e3 : r2; s = s + (i = i + t2[n++] | 0) | 0, --a; ) ;
              i %= 65521, s %= 65521;
            }
            return i | s << 16 | 0;
          };
        }, {}], 44: [function(e, t, r) {
          "use strict";
          t.exports = { Z_NO_FLUSH: 0, Z_PARTIAL_FLUSH: 1, Z_SYNC_FLUSH: 2, Z_FULL_FLUSH: 3, Z_FINISH: 4, Z_BLOCK: 5, Z_TREES: 6, Z_OK: 0, Z_STREAM_END: 1, Z_NEED_DICT: 2, Z_ERRNO: -1, Z_STREAM_ERROR: -2, Z_DATA_ERROR: -3, Z_BUF_ERROR: -5, Z_NO_COMPRESSION: 0, Z_BEST_SPEED: 1, Z_BEST_COMPRESSION: 9, Z_DEFAULT_COMPRESSION: -1, Z_FILTERED: 1, Z_HUFFMAN_ONLY: 2, Z_RLE: 3, Z_FIXED: 4, Z_DEFAULT_STRATEGY: 0, Z_BINARY: 0, Z_TEXT: 1, Z_UNKNOWN: 2, Z_DEFLATED: 8 };
        }, {}], 45: [function(e, t, r) {
          "use strict";
          var o = function() {
            for (var e2, t2 = [], r2 = 0; r2 < 256; r2++) {
              e2 = r2;
              for (var n = 0; n < 8; n++) e2 = 1 & e2 ? 3988292384 ^ e2 >>> 1 : e2 >>> 1;
              t2[r2] = e2;
            }
            return t2;
          }();
          t.exports = function(e2, t2, r2, n) {
            var i = o, s = n + r2;
            e2 ^= -1;
            for (var a = n; a < s; a++) e2 = e2 >>> 8 ^ i[255 & (e2 ^ t2[a])];
            return -1 ^ e2;
          };
        }, {}], 46: [function(e, t, r) {
          "use strict";
          var h, c = e("../utils/common"), u = e("./trees"), d = e("./adler32"), p = e("./crc32"), n = e("./messages"), l = 0, f = 4, m = 0, _ = -2, g = -1, b = 4, i = 2, v = 8, y = 9, s = 286, a = 30, o = 19, w = 2 * s + 1, k = 15, x = 3, S = 258, z = S + x + 1, C = 42, E = 113, A = 1, I = 2, O = 3, B = 4;
          function R(e2, t2) {
            return e2.msg = n[t2], t2;
          }
          function T(e2) {
            return (e2 << 1) - (4 < e2 ? 9 : 0);
          }
          function D2(e2) {
            for (var t2 = e2.length; 0 <= --t2; ) e2[t2] = 0;
          }
          function F(e2) {
            var t2 = e2.state, r2 = t2.pending;
            r2 > e2.avail_out && (r2 = e2.avail_out), 0 !== r2 && (c.arraySet(e2.output, t2.pending_buf, t2.pending_out, r2, e2.next_out), e2.next_out += r2, t2.pending_out += r2, e2.total_out += r2, e2.avail_out -= r2, t2.pending -= r2, 0 === t2.pending && (t2.pending_out = 0));
          }
          function N(e2, t2) {
            u._tr_flush_block(e2, 0 <= e2.block_start ? e2.block_start : -1, e2.strstart - e2.block_start, t2), e2.block_start = e2.strstart, F(e2.strm);
          }
          function U(e2, t2) {
            e2.pending_buf[e2.pending++] = t2;
          }
          function P(e2, t2) {
            e2.pending_buf[e2.pending++] = t2 >>> 8 & 255, e2.pending_buf[e2.pending++] = 255 & t2;
          }
          function L2(e2, t2) {
            var r2, n2, i2 = e2.max_chain_length, s2 = e2.strstart, a2 = e2.prev_length, o2 = e2.nice_match, h2 = e2.strstart > e2.w_size - z ? e2.strstart - (e2.w_size - z) : 0, u2 = e2.window, l2 = e2.w_mask, f2 = e2.prev, c2 = e2.strstart + S, d2 = u2[s2 + a2 - 1], p2 = u2[s2 + a2];
            e2.prev_length >= e2.good_match && (i2 >>= 2), o2 > e2.lookahead && (o2 = e2.lookahead);
            do {
              if (u2[(r2 = t2) + a2] === p2 && u2[r2 + a2 - 1] === d2 && u2[r2] === u2[s2] && u2[++r2] === u2[s2 + 1]) {
                s2 += 2, r2++;
                do {
                } while (u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && s2 < c2);
                if (n2 = S - (c2 - s2), s2 = c2 - S, a2 < n2) {
                  if (e2.match_start = t2, o2 <= (a2 = n2)) break;
                  d2 = u2[s2 + a2 - 1], p2 = u2[s2 + a2];
                }
              }
            } while ((t2 = f2[t2 & l2]) > h2 && 0 != --i2);
            return a2 <= e2.lookahead ? a2 : e2.lookahead;
          }
          function j(e2) {
            var t2, r2, n2, i2, s2, a2, o2, h2, u2, l2, f2 = e2.w_size;
            do {
              if (i2 = e2.window_size - e2.lookahead - e2.strstart, e2.strstart >= f2 + (f2 - z)) {
                for (c.arraySet(e2.window, e2.window, f2, f2, 0), e2.match_start -= f2, e2.strstart -= f2, e2.block_start -= f2, t2 = r2 = e2.hash_size; n2 = e2.head[--t2], e2.head[t2] = f2 <= n2 ? n2 - f2 : 0, --r2; ) ;
                for (t2 = r2 = f2; n2 = e2.prev[--t2], e2.prev[t2] = f2 <= n2 ? n2 - f2 : 0, --r2; ) ;
                i2 += f2;
              }
              if (0 === e2.strm.avail_in) break;
              if (a2 = e2.strm, o2 = e2.window, h2 = e2.strstart + e2.lookahead, u2 = i2, l2 = void 0, l2 = a2.avail_in, u2 < l2 && (l2 = u2), r2 = 0 === l2 ? 0 : (a2.avail_in -= l2, c.arraySet(o2, a2.input, a2.next_in, l2, h2), 1 === a2.state.wrap ? a2.adler = d(a2.adler, o2, l2, h2) : 2 === a2.state.wrap && (a2.adler = p(a2.adler, o2, l2, h2)), a2.next_in += l2, a2.total_in += l2, l2), e2.lookahead += r2, e2.lookahead + e2.insert >= x) for (s2 = e2.strstart - e2.insert, e2.ins_h = e2.window[s2], e2.ins_h = (e2.ins_h << e2.hash_shift ^ e2.window[s2 + 1]) & e2.hash_mask; e2.insert && (e2.ins_h = (e2.ins_h << e2.hash_shift ^ e2.window[s2 + x - 1]) & e2.hash_mask, e2.prev[s2 & e2.w_mask] = e2.head[e2.ins_h], e2.head[e2.ins_h] = s2, s2++, e2.insert--, !(e2.lookahead + e2.insert < x)); ) ;
            } while (e2.lookahead < z && 0 !== e2.strm.avail_in);
          }
          function Z(e2, t2) {
            for (var r2, n2; ; ) {
              if (e2.lookahead < z) {
                if (j(e2), e2.lookahead < z && t2 === l) return A;
                if (0 === e2.lookahead) break;
              }
              if (r2 = 0, e2.lookahead >= x && (e2.ins_h = (e2.ins_h << e2.hash_shift ^ e2.window[e2.strstart + x - 1]) & e2.hash_mask, r2 = e2.prev[e2.strstart & e2.w_mask] = e2.head[e2.ins_h], e2.head[e2.ins_h] = e2.strstart), 0 !== r2 && e2.strstart - r2 <= e2.w_size - z && (e2.match_length = L2(e2, r2)), e2.match_length >= x) if (n2 = u._tr_tally(e2, e2.strstart - e2.match_start, e2.match_length - x), e2.lookahead -= e2.match_length, e2.match_length <= e2.max_lazy_match && e2.lookahead >= x) {
                for (e2.match_length--; e2.strstart++, e2.ins_h = (e2.ins_h << e2.hash_shift ^ e2.window[e2.strstart + x - 1]) & e2.hash_mask, r2 = e2.prev[e2.strstart & e2.w_mask] = e2.head[e2.ins_h], e2.head[e2.ins_h] = e2.strstart, 0 != --e2.match_length; ) ;
                e2.strstart++;
              } else e2.strstart += e2.match_length, e2.match_length = 0, e2.ins_h = e2.window[e2.strstart], e2.ins_h = (e2.ins_h << e2.hash_shift ^ e2.window[e2.strstart + 1]) & e2.hash_mask;
              else n2 = u._tr_tally(e2, 0, e2.window[e2.strstart]), e2.lookahead--, e2.strstart++;
              if (n2 && (N(e2, false), 0 === e2.strm.avail_out)) return A;
            }
            return e2.insert = e2.strstart < x - 1 ? e2.strstart : x - 1, t2 === f ? (N(e2, true), 0 === e2.strm.avail_out ? O : B) : e2.last_lit && (N(e2, false), 0 === e2.strm.avail_out) ? A : I;
          }
          function W(e2, t2) {
            for (var r2, n2, i2; ; ) {
              if (e2.lookahead < z) {
                if (j(e2), e2.lookahead < z && t2 === l) return A;
                if (0 === e2.lookahead) break;
              }
              if (r2 = 0, e2.lookahead >= x && (e2.ins_h = (e2.ins_h << e2.hash_shift ^ e2.window[e2.strstart + x - 1]) & e2.hash_mask, r2 = e2.prev[e2.strstart & e2.w_mask] = e2.head[e2.ins_h], e2.head[e2.ins_h] = e2.strstart), e2.prev_length = e2.match_length, e2.prev_match = e2.match_start, e2.match_length = x - 1, 0 !== r2 && e2.prev_length < e2.max_lazy_match && e2.strstart - r2 <= e2.w_size - z && (e2.match_length = L2(e2, r2), e2.match_length <= 5 && (1 === e2.strategy || e2.match_length === x && 4096 < e2.strstart - e2.match_start) && (e2.match_length = x - 1)), e2.prev_length >= x && e2.match_length <= e2.prev_length) {
                for (i2 = e2.strstart + e2.lookahead - x, n2 = u._tr_tally(e2, e2.strstart - 1 - e2.prev_match, e2.prev_length - x), e2.lookahead -= e2.prev_length - 1, e2.prev_length -= 2; ++e2.strstart <= i2 && (e2.ins_h = (e2.ins_h << e2.hash_shift ^ e2.window[e2.strstart + x - 1]) & e2.hash_mask, r2 = e2.prev[e2.strstart & e2.w_mask] = e2.head[e2.ins_h], e2.head[e2.ins_h] = e2.strstart), 0 != --e2.prev_length; ) ;
                if (e2.match_available = 0, e2.match_length = x - 1, e2.strstart++, n2 && (N(e2, false), 0 === e2.strm.avail_out)) return A;
              } else if (e2.match_available) {
                if ((n2 = u._tr_tally(e2, 0, e2.window[e2.strstart - 1])) && N(e2, false), e2.strstart++, e2.lookahead--, 0 === e2.strm.avail_out) return A;
              } else e2.match_available = 1, e2.strstart++, e2.lookahead--;
            }
            return e2.match_available && (n2 = u._tr_tally(e2, 0, e2.window[e2.strstart - 1]), e2.match_available = 0), e2.insert = e2.strstart < x - 1 ? e2.strstart : x - 1, t2 === f ? (N(e2, true), 0 === e2.strm.avail_out ? O : B) : e2.last_lit && (N(e2, false), 0 === e2.strm.avail_out) ? A : I;
          }
          function M(e2, t2, r2, n2, i2) {
            this.good_length = e2, this.max_lazy = t2, this.nice_length = r2, this.max_chain = n2, this.func = i2;
          }
          function H() {
            this.strm = null, this.status = 0, this.pending_buf = null, this.pending_buf_size = 0, this.pending_out = 0, this.pending = 0, this.wrap = 0, this.gzhead = null, this.gzindex = 0, this.method = v, this.last_flush = -1, this.w_size = 0, this.w_bits = 0, this.w_mask = 0, this.window = null, this.window_size = 0, this.prev = null, this.head = null, this.ins_h = 0, this.hash_size = 0, this.hash_bits = 0, this.hash_mask = 0, this.hash_shift = 0, this.block_start = 0, this.match_length = 0, this.prev_match = 0, this.match_available = 0, this.strstart = 0, this.match_start = 0, this.lookahead = 0, this.prev_length = 0, this.max_chain_length = 0, this.max_lazy_match = 0, this.level = 0, this.strategy = 0, this.good_match = 0, this.nice_match = 0, this.dyn_ltree = new c.Buf16(2 * w), this.dyn_dtree = new c.Buf16(2 * (2 * a + 1)), this.bl_tree = new c.Buf16(2 * (2 * o + 1)), D2(this.dyn_ltree), D2(this.dyn_dtree), D2(this.bl_tree), this.l_desc = null, this.d_desc = null, this.bl_desc = null, this.bl_count = new c.Buf16(k + 1), this.heap = new c.Buf16(2 * s + 1), D2(this.heap), this.heap_len = 0, this.heap_max = 0, this.depth = new c.Buf16(2 * s + 1), D2(this.depth), this.l_buf = 0, this.lit_bufsize = 0, this.last_lit = 0, this.d_buf = 0, this.opt_len = 0, this.static_len = 0, this.matches = 0, this.insert = 0, this.bi_buf = 0, this.bi_valid = 0;
          }
          function G(e2) {
            var t2;
            return e2 && e2.state ? (e2.total_in = e2.total_out = 0, e2.data_type = i, (t2 = e2.state).pending = 0, t2.pending_out = 0, t2.wrap < 0 && (t2.wrap = -t2.wrap), t2.status = t2.wrap ? C : E, e2.adler = 2 === t2.wrap ? 0 : 1, t2.last_flush = l, u._tr_init(t2), m) : R(e2, _);
          }
          function K(e2) {
            var t2 = G(e2);
            return t2 === m && function(e3) {
              e3.window_size = 2 * e3.w_size, D2(e3.head), e3.max_lazy_match = h[e3.level].max_lazy, e3.good_match = h[e3.level].good_length, e3.nice_match = h[e3.level].nice_length, e3.max_chain_length = h[e3.level].max_chain, e3.strstart = 0, e3.block_start = 0, e3.lookahead = 0, e3.insert = 0, e3.match_length = e3.prev_length = x - 1, e3.match_available = 0, e3.ins_h = 0;
            }(e2.state), t2;
          }
          function Y(e2, t2, r2, n2, i2, s2) {
            if (!e2) return _;
            var a2 = 1;
            if (t2 === g && (t2 = 6), n2 < 0 ? (a2 = 0, n2 = -n2) : 15 < n2 && (a2 = 2, n2 -= 16), i2 < 1 || y < i2 || r2 !== v || n2 < 8 || 15 < n2 || t2 < 0 || 9 < t2 || s2 < 0 || b < s2) return R(e2, _);
            8 === n2 && (n2 = 9);
            var o2 = new H();
            return (e2.state = o2).strm = e2, o2.wrap = a2, o2.gzhead = null, o2.w_bits = n2, o2.w_size = 1 << o2.w_bits, o2.w_mask = o2.w_size - 1, o2.hash_bits = i2 + 7, o2.hash_size = 1 << o2.hash_bits, o2.hash_mask = o2.hash_size - 1, o2.hash_shift = ~~((o2.hash_bits + x - 1) / x), o2.window = new c.Buf8(2 * o2.w_size), o2.head = new c.Buf16(o2.hash_size), o2.prev = new c.Buf16(o2.w_size), o2.lit_bufsize = 1 << i2 + 6, o2.pending_buf_size = 4 * o2.lit_bufsize, o2.pending_buf = new c.Buf8(o2.pending_buf_size), o2.d_buf = 1 * o2.lit_bufsize, o2.l_buf = 3 * o2.lit_bufsize, o2.level = t2, o2.strategy = s2, o2.method = r2, K(e2);
          }
          h = [new M(0, 0, 0, 0, function(e2, t2) {
            var r2 = 65535;
            for (r2 > e2.pending_buf_size - 5 && (r2 = e2.pending_buf_size - 5); ; ) {
              if (e2.lookahead <= 1) {
                if (j(e2), 0 === e2.lookahead && t2 === l) return A;
                if (0 === e2.lookahead) break;
              }
              e2.strstart += e2.lookahead, e2.lookahead = 0;
              var n2 = e2.block_start + r2;
              if ((0 === e2.strstart || e2.strstart >= n2) && (e2.lookahead = e2.strstart - n2, e2.strstart = n2, N(e2, false), 0 === e2.strm.avail_out)) return A;
              if (e2.strstart - e2.block_start >= e2.w_size - z && (N(e2, false), 0 === e2.strm.avail_out)) return A;
            }
            return e2.insert = 0, t2 === f ? (N(e2, true), 0 === e2.strm.avail_out ? O : B) : (e2.strstart > e2.block_start && (N(e2, false), e2.strm.avail_out), A);
          }), new M(4, 4, 8, 4, Z), new M(4, 5, 16, 8, Z), new M(4, 6, 32, 32, Z), new M(4, 4, 16, 16, W), new M(8, 16, 32, 32, W), new M(8, 16, 128, 128, W), new M(8, 32, 128, 256, W), new M(32, 128, 258, 1024, W), new M(32, 258, 258, 4096, W)], r.deflateInit = function(e2, t2) {
            return Y(e2, t2, v, 15, 8, 0);
          }, r.deflateInit2 = Y, r.deflateReset = K, r.deflateResetKeep = G, r.deflateSetHeader = function(e2, t2) {
            return e2 && e2.state ? 2 !== e2.state.wrap ? _ : (e2.state.gzhead = t2, m) : _;
          }, r.deflate = function(e2, t2) {
            var r2, n2, i2, s2;
            if (!e2 || !e2.state || 5 < t2 || t2 < 0) return e2 ? R(e2, _) : _;
            if (n2 = e2.state, !e2.output || !e2.input && 0 !== e2.avail_in || 666 === n2.status && t2 !== f) return R(e2, 0 === e2.avail_out ? -5 : _);
            if (n2.strm = e2, r2 = n2.last_flush, n2.last_flush = t2, n2.status === C) if (2 === n2.wrap) e2.adler = 0, U(n2, 31), U(n2, 139), U(n2, 8), n2.gzhead ? (U(n2, (n2.gzhead.text ? 1 : 0) + (n2.gzhead.hcrc ? 2 : 0) + (n2.gzhead.extra ? 4 : 0) + (n2.gzhead.name ? 8 : 0) + (n2.gzhead.comment ? 16 : 0)), U(n2, 255 & n2.gzhead.time), U(n2, n2.gzhead.time >> 8 & 255), U(n2, n2.gzhead.time >> 16 & 255), U(n2, n2.gzhead.time >> 24 & 255), U(n2, 9 === n2.level ? 2 : 2 <= n2.strategy || n2.level < 2 ? 4 : 0), U(n2, 255 & n2.gzhead.os), n2.gzhead.extra && n2.gzhead.extra.length && (U(n2, 255 & n2.gzhead.extra.length), U(n2, n2.gzhead.extra.length >> 8 & 255)), n2.gzhead.hcrc && (e2.adler = p(e2.adler, n2.pending_buf, n2.pending, 0)), n2.gzindex = 0, n2.status = 69) : (U(n2, 0), U(n2, 0), U(n2, 0), U(n2, 0), U(n2, 0), U(n2, 9 === n2.level ? 2 : 2 <= n2.strategy || n2.level < 2 ? 4 : 0), U(n2, 3), n2.status = E);
            else {
              var a2 = v + (n2.w_bits - 8 << 4) << 8;
              a2 |= (2 <= n2.strategy || n2.level < 2 ? 0 : n2.level < 6 ? 1 : 6 === n2.level ? 2 : 3) << 6, 0 !== n2.strstart && (a2 |= 32), a2 += 31 - a2 % 31, n2.status = E, P(n2, a2), 0 !== n2.strstart && (P(n2, e2.adler >>> 16), P(n2, 65535 & e2.adler)), e2.adler = 1;
            }
            if (69 === n2.status) if (n2.gzhead.extra) {
              for (i2 = n2.pending; n2.gzindex < (65535 & n2.gzhead.extra.length) && (n2.pending !== n2.pending_buf_size || (n2.gzhead.hcrc && n2.pending > i2 && (e2.adler = p(e2.adler, n2.pending_buf, n2.pending - i2, i2)), F(e2), i2 = n2.pending, n2.pending !== n2.pending_buf_size)); ) U(n2, 255 & n2.gzhead.extra[n2.gzindex]), n2.gzindex++;
              n2.gzhead.hcrc && n2.pending > i2 && (e2.adler = p(e2.adler, n2.pending_buf, n2.pending - i2, i2)), n2.gzindex === n2.gzhead.extra.length && (n2.gzindex = 0, n2.status = 73);
            } else n2.status = 73;
            if (73 === n2.status) if (n2.gzhead.name) {
              i2 = n2.pending;
              do {
                if (n2.pending === n2.pending_buf_size && (n2.gzhead.hcrc && n2.pending > i2 && (e2.adler = p(e2.adler, n2.pending_buf, n2.pending - i2, i2)), F(e2), i2 = n2.pending, n2.pending === n2.pending_buf_size)) {
                  s2 = 1;
                  break;
                }
                s2 = n2.gzindex < n2.gzhead.name.length ? 255 & n2.gzhead.name.charCodeAt(n2.gzindex++) : 0, U(n2, s2);
              } while (0 !== s2);
              n2.gzhead.hcrc && n2.pending > i2 && (e2.adler = p(e2.adler, n2.pending_buf, n2.pending - i2, i2)), 0 === s2 && (n2.gzindex = 0, n2.status = 91);
            } else n2.status = 91;
            if (91 === n2.status) if (n2.gzhead.comment) {
              i2 = n2.pending;
              do {
                if (n2.pending === n2.pending_buf_size && (n2.gzhead.hcrc && n2.pending > i2 && (e2.adler = p(e2.adler, n2.pending_buf, n2.pending - i2, i2)), F(e2), i2 = n2.pending, n2.pending === n2.pending_buf_size)) {
                  s2 = 1;
                  break;
                }
                s2 = n2.gzindex < n2.gzhead.comment.length ? 255 & n2.gzhead.comment.charCodeAt(n2.gzindex++) : 0, U(n2, s2);
              } while (0 !== s2);
              n2.gzhead.hcrc && n2.pending > i2 && (e2.adler = p(e2.adler, n2.pending_buf, n2.pending - i2, i2)), 0 === s2 && (n2.status = 103);
            } else n2.status = 103;
            if (103 === n2.status && (n2.gzhead.hcrc ? (n2.pending + 2 > n2.pending_buf_size && F(e2), n2.pending + 2 <= n2.pending_buf_size && (U(n2, 255 & e2.adler), U(n2, e2.adler >> 8 & 255), e2.adler = 0, n2.status = E)) : n2.status = E), 0 !== n2.pending) {
              if (F(e2), 0 === e2.avail_out) return n2.last_flush = -1, m;
            } else if (0 === e2.avail_in && T(t2) <= T(r2) && t2 !== f) return R(e2, -5);
            if (666 === n2.status && 0 !== e2.avail_in) return R(e2, -5);
            if (0 !== e2.avail_in || 0 !== n2.lookahead || t2 !== l && 666 !== n2.status) {
              var o2 = 2 === n2.strategy ? function(e3, t3) {
                for (var r3; ; ) {
                  if (0 === e3.lookahead && (j(e3), 0 === e3.lookahead)) {
                    if (t3 === l) return A;
                    break;
                  }
                  if (e3.match_length = 0, r3 = u._tr_tally(e3, 0, e3.window[e3.strstart]), e3.lookahead--, e3.strstart++, r3 && (N(e3, false), 0 === e3.strm.avail_out)) return A;
                }
                return e3.insert = 0, t3 === f ? (N(e3, true), 0 === e3.strm.avail_out ? O : B) : e3.last_lit && (N(e3, false), 0 === e3.strm.avail_out) ? A : I;
              }(n2, t2) : 3 === n2.strategy ? function(e3, t3) {
                for (var r3, n3, i3, s3, a3 = e3.window; ; ) {
                  if (e3.lookahead <= S) {
                    if (j(e3), e3.lookahead <= S && t3 === l) return A;
                    if (0 === e3.lookahead) break;
                  }
                  if (e3.match_length = 0, e3.lookahead >= x && 0 < e3.strstart && (n3 = a3[i3 = e3.strstart - 1]) === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3]) {
                    s3 = e3.strstart + S;
                    do {
                    } while (n3 === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3] && i3 < s3);
                    e3.match_length = S - (s3 - i3), e3.match_length > e3.lookahead && (e3.match_length = e3.lookahead);
                  }
                  if (e3.match_length >= x ? (r3 = u._tr_tally(e3, 1, e3.match_length - x), e3.lookahead -= e3.match_length, e3.strstart += e3.match_length, e3.match_length = 0) : (r3 = u._tr_tally(e3, 0, e3.window[e3.strstart]), e3.lookahead--, e3.strstart++), r3 && (N(e3, false), 0 === e3.strm.avail_out)) return A;
                }
                return e3.insert = 0, t3 === f ? (N(e3, true), 0 === e3.strm.avail_out ? O : B) : e3.last_lit && (N(e3, false), 0 === e3.strm.avail_out) ? A : I;
              }(n2, t2) : h[n2.level].func(n2, t2);
              if (o2 !== O && o2 !== B || (n2.status = 666), o2 === A || o2 === O) return 0 === e2.avail_out && (n2.last_flush = -1), m;
              if (o2 === I && (1 === t2 ? u._tr_align(n2) : 5 !== t2 && (u._tr_stored_block(n2, 0, 0, false), 3 === t2 && (D2(n2.head), 0 === n2.lookahead && (n2.strstart = 0, n2.block_start = 0, n2.insert = 0))), F(e2), 0 === e2.avail_out)) return n2.last_flush = -1, m;
            }
            return t2 !== f ? m : n2.wrap <= 0 ? 1 : (2 === n2.wrap ? (U(n2, 255 & e2.adler), U(n2, e2.adler >> 8 & 255), U(n2, e2.adler >> 16 & 255), U(n2, e2.adler >> 24 & 255), U(n2, 255 & e2.total_in), U(n2, e2.total_in >> 8 & 255), U(n2, e2.total_in >> 16 & 255), U(n2, e2.total_in >> 24 & 255)) : (P(n2, e2.adler >>> 16), P(n2, 65535 & e2.adler)), F(e2), 0 < n2.wrap && (n2.wrap = -n2.wrap), 0 !== n2.pending ? m : 1);
          }, r.deflateEnd = function(e2) {
            var t2;
            return e2 && e2.state ? (t2 = e2.state.status) !== C && 69 !== t2 && 73 !== t2 && 91 !== t2 && 103 !== t2 && t2 !== E && 666 !== t2 ? R(e2, _) : (e2.state = null, t2 === E ? R(e2, -3) : m) : _;
          }, r.deflateSetDictionary = function(e2, t2) {
            var r2, n2, i2, s2, a2, o2, h2, u2, l2 = t2.length;
            if (!e2 || !e2.state) return _;
            if (2 === (s2 = (r2 = e2.state).wrap) || 1 === s2 && r2.status !== C || r2.lookahead) return _;
            for (1 === s2 && (e2.adler = d(e2.adler, t2, l2, 0)), r2.wrap = 0, l2 >= r2.w_size && (0 === s2 && (D2(r2.head), r2.strstart = 0, r2.block_start = 0, r2.insert = 0), u2 = new c.Buf8(r2.w_size), c.arraySet(u2, t2, l2 - r2.w_size, r2.w_size, 0), t2 = u2, l2 = r2.w_size), a2 = e2.avail_in, o2 = e2.next_in, h2 = e2.input, e2.avail_in = l2, e2.next_in = 0, e2.input = t2, j(r2); r2.lookahead >= x; ) {
              for (n2 = r2.strstart, i2 = r2.lookahead - (x - 1); r2.ins_h = (r2.ins_h << r2.hash_shift ^ r2.window[n2 + x - 1]) & r2.hash_mask, r2.prev[n2 & r2.w_mask] = r2.head[r2.ins_h], r2.head[r2.ins_h] = n2, n2++, --i2; ) ;
              r2.strstart = n2, r2.lookahead = x - 1, j(r2);
            }
            return r2.strstart += r2.lookahead, r2.block_start = r2.strstart, r2.insert = r2.lookahead, r2.lookahead = 0, r2.match_length = r2.prev_length = x - 1, r2.match_available = 0, e2.next_in = o2, e2.input = h2, e2.avail_in = a2, r2.wrap = s2, m;
          }, r.deflateInfo = "pako deflate (from Nodeca project)";
        }, { "../utils/common": 41, "./adler32": 43, "./crc32": 45, "./messages": 51, "./trees": 52 }], 47: [function(e, t, r) {
          "use strict";
          t.exports = function() {
            this.text = 0, this.time = 0, this.xflags = 0, this.os = 0, this.extra = null, this.extra_len = 0, this.name = "", this.comment = "", this.hcrc = 0, this.done = false;
          };
        }, {}], 48: [function(e, t, r) {
          "use strict";
          t.exports = function(e2, t2) {
            var r2, n, i, s, a, o, h, u, l, f, c, d, p, m, _, g, b, v, y, w, k, x, S, z, C;
            r2 = e2.state, n = e2.next_in, z = e2.input, i = n + (e2.avail_in - 5), s = e2.next_out, C = e2.output, a = s - (t2 - e2.avail_out), o = s + (e2.avail_out - 257), h = r2.dmax, u = r2.wsize, l = r2.whave, f = r2.wnext, c = r2.window, d = r2.hold, p = r2.bits, m = r2.lencode, _ = r2.distcode, g = (1 << r2.lenbits) - 1, b = (1 << r2.distbits) - 1;
            e: do {
              p < 15 && (d += z[n++] << p, p += 8, d += z[n++] << p, p += 8), v = m[d & g];
              t: for (; ; ) {
                if (d >>>= y = v >>> 24, p -= y, 0 === (y = v >>> 16 & 255)) C[s++] = 65535 & v;
                else {
                  if (!(16 & y)) {
                    if (0 == (64 & y)) {
                      v = m[(65535 & v) + (d & (1 << y) - 1)];
                      continue t;
                    }
                    if (32 & y) {
                      r2.mode = 12;
                      break e;
                    }
                    e2.msg = "invalid literal/length code", r2.mode = 30;
                    break e;
                  }
                  w = 65535 & v, (y &= 15) && (p < y && (d += z[n++] << p, p += 8), w += d & (1 << y) - 1, d >>>= y, p -= y), p < 15 && (d += z[n++] << p, p += 8, d += z[n++] << p, p += 8), v = _[d & b];
                  r: for (; ; ) {
                    if (d >>>= y = v >>> 24, p -= y, !(16 & (y = v >>> 16 & 255))) {
                      if (0 == (64 & y)) {
                        v = _[(65535 & v) + (d & (1 << y) - 1)];
                        continue r;
                      }
                      e2.msg = "invalid distance code", r2.mode = 30;
                      break e;
                    }
                    if (k = 65535 & v, p < (y &= 15) && (d += z[n++] << p, (p += 8) < y && (d += z[n++] << p, p += 8)), h < (k += d & (1 << y) - 1)) {
                      e2.msg = "invalid distance too far back", r2.mode = 30;
                      break e;
                    }
                    if (d >>>= y, p -= y, (y = s - a) < k) {
                      if (l < (y = k - y) && r2.sane) {
                        e2.msg = "invalid distance too far back", r2.mode = 30;
                        break e;
                      }
                      if (S = c, (x = 0) === f) {
                        if (x += u - y, y < w) {
                          for (w -= y; C[s++] = c[x++], --y; ) ;
                          x = s - k, S = C;
                        }
                      } else if (f < y) {
                        if (x += u + f - y, (y -= f) < w) {
                          for (w -= y; C[s++] = c[x++], --y; ) ;
                          if (x = 0, f < w) {
                            for (w -= y = f; C[s++] = c[x++], --y; ) ;
                            x = s - k, S = C;
                          }
                        }
                      } else if (x += f - y, y < w) {
                        for (w -= y; C[s++] = c[x++], --y; ) ;
                        x = s - k, S = C;
                      }
                      for (; 2 < w; ) C[s++] = S[x++], C[s++] = S[x++], C[s++] = S[x++], w -= 3;
                      w && (C[s++] = S[x++], 1 < w && (C[s++] = S[x++]));
                    } else {
                      for (x = s - k; C[s++] = C[x++], C[s++] = C[x++], C[s++] = C[x++], 2 < (w -= 3); ) ;
                      w && (C[s++] = C[x++], 1 < w && (C[s++] = C[x++]));
                    }
                    break;
                  }
                }
                break;
              }
            } while (n < i && s < o);
            n -= w = p >> 3, d &= (1 << (p -= w << 3)) - 1, e2.next_in = n, e2.next_out = s, e2.avail_in = n < i ? i - n + 5 : 5 - (n - i), e2.avail_out = s < o ? o - s + 257 : 257 - (s - o), r2.hold = d, r2.bits = p;
          };
        }, {}], 49: [function(e, t, r) {
          "use strict";
          var I = e("../utils/common"), O = e("./adler32"), B = e("./crc32"), R = e("./inffast"), T = e("./inftrees"), D2 = 1, F = 2, N = 0, U = -2, P = 1, n = 852, i = 592;
          function L2(e2) {
            return (e2 >>> 24 & 255) + (e2 >>> 8 & 65280) + ((65280 & e2) << 8) + ((255 & e2) << 24);
          }
          function s() {
            this.mode = 0, this.last = false, this.wrap = 0, this.havedict = false, this.flags = 0, this.dmax = 0, this.check = 0, this.total = 0, this.head = null, this.wbits = 0, this.wsize = 0, this.whave = 0, this.wnext = 0, this.window = null, this.hold = 0, this.bits = 0, this.length = 0, this.offset = 0, this.extra = 0, this.lencode = null, this.distcode = null, this.lenbits = 0, this.distbits = 0, this.ncode = 0, this.nlen = 0, this.ndist = 0, this.have = 0, this.next = null, this.lens = new I.Buf16(320), this.work = new I.Buf16(288), this.lendyn = null, this.distdyn = null, this.sane = 0, this.back = 0, this.was = 0;
          }
          function a(e2) {
            var t2;
            return e2 && e2.state ? (t2 = e2.state, e2.total_in = e2.total_out = t2.total = 0, e2.msg = "", t2.wrap && (e2.adler = 1 & t2.wrap), t2.mode = P, t2.last = 0, t2.havedict = 0, t2.dmax = 32768, t2.head = null, t2.hold = 0, t2.bits = 0, t2.lencode = t2.lendyn = new I.Buf32(n), t2.distcode = t2.distdyn = new I.Buf32(i), t2.sane = 1, t2.back = -1, N) : U;
          }
          function o(e2) {
            var t2;
            return e2 && e2.state ? ((t2 = e2.state).wsize = 0, t2.whave = 0, t2.wnext = 0, a(e2)) : U;
          }
          function h(e2, t2) {
            var r2, n2;
            return e2 && e2.state ? (n2 = e2.state, t2 < 0 ? (r2 = 0, t2 = -t2) : (r2 = 1 + (t2 >> 4), t2 < 48 && (t2 &= 15)), t2 && (t2 < 8 || 15 < t2) ? U : (null !== n2.window && n2.wbits !== t2 && (n2.window = null), n2.wrap = r2, n2.wbits = t2, o(e2))) : U;
          }
          function u(e2, t2) {
            var r2, n2;
            return e2 ? (n2 = new s(), (e2.state = n2).window = null, (r2 = h(e2, t2)) !== N && (e2.state = null), r2) : U;
          }
          var l, f, c = true;
          function j(e2) {
            if (c) {
              var t2;
              for (l = new I.Buf32(512), f = new I.Buf32(32), t2 = 0; t2 < 144; ) e2.lens[t2++] = 8;
              for (; t2 < 256; ) e2.lens[t2++] = 9;
              for (; t2 < 280; ) e2.lens[t2++] = 7;
              for (; t2 < 288; ) e2.lens[t2++] = 8;
              for (T(D2, e2.lens, 0, 288, l, 0, e2.work, { bits: 9 }), t2 = 0; t2 < 32; ) e2.lens[t2++] = 5;
              T(F, e2.lens, 0, 32, f, 0, e2.work, { bits: 5 }), c = false;
            }
            e2.lencode = l, e2.lenbits = 9, e2.distcode = f, e2.distbits = 5;
          }
          function Z(e2, t2, r2, n2) {
            var i2, s2 = e2.state;
            return null === s2.window && (s2.wsize = 1 << s2.wbits, s2.wnext = 0, s2.whave = 0, s2.window = new I.Buf8(s2.wsize)), n2 >= s2.wsize ? (I.arraySet(s2.window, t2, r2 - s2.wsize, s2.wsize, 0), s2.wnext = 0, s2.whave = s2.wsize) : (n2 < (i2 = s2.wsize - s2.wnext) && (i2 = n2), I.arraySet(s2.window, t2, r2 - n2, i2, s2.wnext), (n2 -= i2) ? (I.arraySet(s2.window, t2, r2 - n2, n2, 0), s2.wnext = n2, s2.whave = s2.wsize) : (s2.wnext += i2, s2.wnext === s2.wsize && (s2.wnext = 0), s2.whave < s2.wsize && (s2.whave += i2))), 0;
          }
          r.inflateReset = o, r.inflateReset2 = h, r.inflateResetKeep = a, r.inflateInit = function(e2) {
            return u(e2, 15);
          }, r.inflateInit2 = u, r.inflate = function(e2, t2) {
            var r2, n2, i2, s2, a2, o2, h2, u2, l2, f2, c2, d, p, m, _, g, b, v, y, w, k, x, S, z, C = 0, E = new I.Buf8(4), A = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
            if (!e2 || !e2.state || !e2.output || !e2.input && 0 !== e2.avail_in) return U;
            12 === (r2 = e2.state).mode && (r2.mode = 13), a2 = e2.next_out, i2 = e2.output, h2 = e2.avail_out, s2 = e2.next_in, n2 = e2.input, o2 = e2.avail_in, u2 = r2.hold, l2 = r2.bits, f2 = o2, c2 = h2, x = N;
            e: for (; ; ) switch (r2.mode) {
              case P:
                if (0 === r2.wrap) {
                  r2.mode = 13;
                  break;
                }
                for (; l2 < 16; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                if (2 & r2.wrap && 35615 === u2) {
                  E[r2.check = 0] = 255 & u2, E[1] = u2 >>> 8 & 255, r2.check = B(r2.check, E, 2, 0), l2 = u2 = 0, r2.mode = 2;
                  break;
                }
                if (r2.flags = 0, r2.head && (r2.head.done = false), !(1 & r2.wrap) || (((255 & u2) << 8) + (u2 >> 8)) % 31) {
                  e2.msg = "incorrect header check", r2.mode = 30;
                  break;
                }
                if (8 != (15 & u2)) {
                  e2.msg = "unknown compression method", r2.mode = 30;
                  break;
                }
                if (l2 -= 4, k = 8 + (15 & (u2 >>>= 4)), 0 === r2.wbits) r2.wbits = k;
                else if (k > r2.wbits) {
                  e2.msg = "invalid window size", r2.mode = 30;
                  break;
                }
                r2.dmax = 1 << k, e2.adler = r2.check = 1, r2.mode = 512 & u2 ? 10 : 12, l2 = u2 = 0;
                break;
              case 2:
                for (; l2 < 16; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                if (r2.flags = u2, 8 != (255 & r2.flags)) {
                  e2.msg = "unknown compression method", r2.mode = 30;
                  break;
                }
                if (57344 & r2.flags) {
                  e2.msg = "unknown header flags set", r2.mode = 30;
                  break;
                }
                r2.head && (r2.head.text = u2 >> 8 & 1), 512 & r2.flags && (E[0] = 255 & u2, E[1] = u2 >>> 8 & 255, r2.check = B(r2.check, E, 2, 0)), l2 = u2 = 0, r2.mode = 3;
              case 3:
                for (; l2 < 32; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                r2.head && (r2.head.time = u2), 512 & r2.flags && (E[0] = 255 & u2, E[1] = u2 >>> 8 & 255, E[2] = u2 >>> 16 & 255, E[3] = u2 >>> 24 & 255, r2.check = B(r2.check, E, 4, 0)), l2 = u2 = 0, r2.mode = 4;
              case 4:
                for (; l2 < 16; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                r2.head && (r2.head.xflags = 255 & u2, r2.head.os = u2 >> 8), 512 & r2.flags && (E[0] = 255 & u2, E[1] = u2 >>> 8 & 255, r2.check = B(r2.check, E, 2, 0)), l2 = u2 = 0, r2.mode = 5;
              case 5:
                if (1024 & r2.flags) {
                  for (; l2 < 16; ) {
                    if (0 === o2) break e;
                    o2--, u2 += n2[s2++] << l2, l2 += 8;
                  }
                  r2.length = u2, r2.head && (r2.head.extra_len = u2), 512 & r2.flags && (E[0] = 255 & u2, E[1] = u2 >>> 8 & 255, r2.check = B(r2.check, E, 2, 0)), l2 = u2 = 0;
                } else r2.head && (r2.head.extra = null);
                r2.mode = 6;
              case 6:
                if (1024 & r2.flags && (o2 < (d = r2.length) && (d = o2), d && (r2.head && (k = r2.head.extra_len - r2.length, r2.head.extra || (r2.head.extra = new Array(r2.head.extra_len)), I.arraySet(r2.head.extra, n2, s2, d, k)), 512 & r2.flags && (r2.check = B(r2.check, n2, d, s2)), o2 -= d, s2 += d, r2.length -= d), r2.length)) break e;
                r2.length = 0, r2.mode = 7;
              case 7:
                if (2048 & r2.flags) {
                  if (0 === o2) break e;
                  for (d = 0; k = n2[s2 + d++], r2.head && k && r2.length < 65536 && (r2.head.name += String.fromCharCode(k)), k && d < o2; ) ;
                  if (512 & r2.flags && (r2.check = B(r2.check, n2, d, s2)), o2 -= d, s2 += d, k) break e;
                } else r2.head && (r2.head.name = null);
                r2.length = 0, r2.mode = 8;
              case 8:
                if (4096 & r2.flags) {
                  if (0 === o2) break e;
                  for (d = 0; k = n2[s2 + d++], r2.head && k && r2.length < 65536 && (r2.head.comment += String.fromCharCode(k)), k && d < o2; ) ;
                  if (512 & r2.flags && (r2.check = B(r2.check, n2, d, s2)), o2 -= d, s2 += d, k) break e;
                } else r2.head && (r2.head.comment = null);
                r2.mode = 9;
              case 9:
                if (512 & r2.flags) {
                  for (; l2 < 16; ) {
                    if (0 === o2) break e;
                    o2--, u2 += n2[s2++] << l2, l2 += 8;
                  }
                  if (u2 !== (65535 & r2.check)) {
                    e2.msg = "header crc mismatch", r2.mode = 30;
                    break;
                  }
                  l2 = u2 = 0;
                }
                r2.head && (r2.head.hcrc = r2.flags >> 9 & 1, r2.head.done = true), e2.adler = r2.check = 0, r2.mode = 12;
                break;
              case 10:
                for (; l2 < 32; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                e2.adler = r2.check = L2(u2), l2 = u2 = 0, r2.mode = 11;
              case 11:
                if (0 === r2.havedict) return e2.next_out = a2, e2.avail_out = h2, e2.next_in = s2, e2.avail_in = o2, r2.hold = u2, r2.bits = l2, 2;
                e2.adler = r2.check = 1, r2.mode = 12;
              case 12:
                if (5 === t2 || 6 === t2) break e;
              case 13:
                if (r2.last) {
                  u2 >>>= 7 & l2, l2 -= 7 & l2, r2.mode = 27;
                  break;
                }
                for (; l2 < 3; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                switch (r2.last = 1 & u2, l2 -= 1, 3 & (u2 >>>= 1)) {
                  case 0:
                    r2.mode = 14;
                    break;
                  case 1:
                    if (j(r2), r2.mode = 20, 6 !== t2) break;
                    u2 >>>= 2, l2 -= 2;
                    break e;
                  case 2:
                    r2.mode = 17;
                    break;
                  case 3:
                    e2.msg = "invalid block type", r2.mode = 30;
                }
                u2 >>>= 2, l2 -= 2;
                break;
              case 14:
                for (u2 >>>= 7 & l2, l2 -= 7 & l2; l2 < 32; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                if ((65535 & u2) != (u2 >>> 16 ^ 65535)) {
                  e2.msg = "invalid stored block lengths", r2.mode = 30;
                  break;
                }
                if (r2.length = 65535 & u2, l2 = u2 = 0, r2.mode = 15, 6 === t2) break e;
              case 15:
                r2.mode = 16;
              case 16:
                if (d = r2.length) {
                  if (o2 < d && (d = o2), h2 < d && (d = h2), 0 === d) break e;
                  I.arraySet(i2, n2, s2, d, a2), o2 -= d, s2 += d, h2 -= d, a2 += d, r2.length -= d;
                  break;
                }
                r2.mode = 12;
                break;
              case 17:
                for (; l2 < 14; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                if (r2.nlen = 257 + (31 & u2), u2 >>>= 5, l2 -= 5, r2.ndist = 1 + (31 & u2), u2 >>>= 5, l2 -= 5, r2.ncode = 4 + (15 & u2), u2 >>>= 4, l2 -= 4, 286 < r2.nlen || 30 < r2.ndist) {
                  e2.msg = "too many length or distance symbols", r2.mode = 30;
                  break;
                }
                r2.have = 0, r2.mode = 18;
              case 18:
                for (; r2.have < r2.ncode; ) {
                  for (; l2 < 3; ) {
                    if (0 === o2) break e;
                    o2--, u2 += n2[s2++] << l2, l2 += 8;
                  }
                  r2.lens[A[r2.have++]] = 7 & u2, u2 >>>= 3, l2 -= 3;
                }
                for (; r2.have < 19; ) r2.lens[A[r2.have++]] = 0;
                if (r2.lencode = r2.lendyn, r2.lenbits = 7, S = { bits: r2.lenbits }, x = T(0, r2.lens, 0, 19, r2.lencode, 0, r2.work, S), r2.lenbits = S.bits, x) {
                  e2.msg = "invalid code lengths set", r2.mode = 30;
                  break;
                }
                r2.have = 0, r2.mode = 19;
              case 19:
                for (; r2.have < r2.nlen + r2.ndist; ) {
                  for (; g = (C = r2.lencode[u2 & (1 << r2.lenbits) - 1]) >>> 16 & 255, b = 65535 & C, !((_ = C >>> 24) <= l2); ) {
                    if (0 === o2) break e;
                    o2--, u2 += n2[s2++] << l2, l2 += 8;
                  }
                  if (b < 16) u2 >>>= _, l2 -= _, r2.lens[r2.have++] = b;
                  else {
                    if (16 === b) {
                      for (z = _ + 2; l2 < z; ) {
                        if (0 === o2) break e;
                        o2--, u2 += n2[s2++] << l2, l2 += 8;
                      }
                      if (u2 >>>= _, l2 -= _, 0 === r2.have) {
                        e2.msg = "invalid bit length repeat", r2.mode = 30;
                        break;
                      }
                      k = r2.lens[r2.have - 1], d = 3 + (3 & u2), u2 >>>= 2, l2 -= 2;
                    } else if (17 === b) {
                      for (z = _ + 3; l2 < z; ) {
                        if (0 === o2) break e;
                        o2--, u2 += n2[s2++] << l2, l2 += 8;
                      }
                      l2 -= _, k = 0, d = 3 + (7 & (u2 >>>= _)), u2 >>>= 3, l2 -= 3;
                    } else {
                      for (z = _ + 7; l2 < z; ) {
                        if (0 === o2) break e;
                        o2--, u2 += n2[s2++] << l2, l2 += 8;
                      }
                      l2 -= _, k = 0, d = 11 + (127 & (u2 >>>= _)), u2 >>>= 7, l2 -= 7;
                    }
                    if (r2.have + d > r2.nlen + r2.ndist) {
                      e2.msg = "invalid bit length repeat", r2.mode = 30;
                      break;
                    }
                    for (; d--; ) r2.lens[r2.have++] = k;
                  }
                }
                if (30 === r2.mode) break;
                if (0 === r2.lens[256]) {
                  e2.msg = "invalid code -- missing end-of-block", r2.mode = 30;
                  break;
                }
                if (r2.lenbits = 9, S = { bits: r2.lenbits }, x = T(D2, r2.lens, 0, r2.nlen, r2.lencode, 0, r2.work, S), r2.lenbits = S.bits, x) {
                  e2.msg = "invalid literal/lengths set", r2.mode = 30;
                  break;
                }
                if (r2.distbits = 6, r2.distcode = r2.distdyn, S = { bits: r2.distbits }, x = T(F, r2.lens, r2.nlen, r2.ndist, r2.distcode, 0, r2.work, S), r2.distbits = S.bits, x) {
                  e2.msg = "invalid distances set", r2.mode = 30;
                  break;
                }
                if (r2.mode = 20, 6 === t2) break e;
              case 20:
                r2.mode = 21;
              case 21:
                if (6 <= o2 && 258 <= h2) {
                  e2.next_out = a2, e2.avail_out = h2, e2.next_in = s2, e2.avail_in = o2, r2.hold = u2, r2.bits = l2, R(e2, c2), a2 = e2.next_out, i2 = e2.output, h2 = e2.avail_out, s2 = e2.next_in, n2 = e2.input, o2 = e2.avail_in, u2 = r2.hold, l2 = r2.bits, 12 === r2.mode && (r2.back = -1);
                  break;
                }
                for (r2.back = 0; g = (C = r2.lencode[u2 & (1 << r2.lenbits) - 1]) >>> 16 & 255, b = 65535 & C, !((_ = C >>> 24) <= l2); ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                if (g && 0 == (240 & g)) {
                  for (v = _, y = g, w = b; g = (C = r2.lencode[w + ((u2 & (1 << v + y) - 1) >> v)]) >>> 16 & 255, b = 65535 & C, !(v + (_ = C >>> 24) <= l2); ) {
                    if (0 === o2) break e;
                    o2--, u2 += n2[s2++] << l2, l2 += 8;
                  }
                  u2 >>>= v, l2 -= v, r2.back += v;
                }
                if (u2 >>>= _, l2 -= _, r2.back += _, r2.length = b, 0 === g) {
                  r2.mode = 26;
                  break;
                }
                if (32 & g) {
                  r2.back = -1, r2.mode = 12;
                  break;
                }
                if (64 & g) {
                  e2.msg = "invalid literal/length code", r2.mode = 30;
                  break;
                }
                r2.extra = 15 & g, r2.mode = 22;
              case 22:
                if (r2.extra) {
                  for (z = r2.extra; l2 < z; ) {
                    if (0 === o2) break e;
                    o2--, u2 += n2[s2++] << l2, l2 += 8;
                  }
                  r2.length += u2 & (1 << r2.extra) - 1, u2 >>>= r2.extra, l2 -= r2.extra, r2.back += r2.extra;
                }
                r2.was = r2.length, r2.mode = 23;
              case 23:
                for (; g = (C = r2.distcode[u2 & (1 << r2.distbits) - 1]) >>> 16 & 255, b = 65535 & C, !((_ = C >>> 24) <= l2); ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                if (0 == (240 & g)) {
                  for (v = _, y = g, w = b; g = (C = r2.distcode[w + ((u2 & (1 << v + y) - 1) >> v)]) >>> 16 & 255, b = 65535 & C, !(v + (_ = C >>> 24) <= l2); ) {
                    if (0 === o2) break e;
                    o2--, u2 += n2[s2++] << l2, l2 += 8;
                  }
                  u2 >>>= v, l2 -= v, r2.back += v;
                }
                if (u2 >>>= _, l2 -= _, r2.back += _, 64 & g) {
                  e2.msg = "invalid distance code", r2.mode = 30;
                  break;
                }
                r2.offset = b, r2.extra = 15 & g, r2.mode = 24;
              case 24:
                if (r2.extra) {
                  for (z = r2.extra; l2 < z; ) {
                    if (0 === o2) break e;
                    o2--, u2 += n2[s2++] << l2, l2 += 8;
                  }
                  r2.offset += u2 & (1 << r2.extra) - 1, u2 >>>= r2.extra, l2 -= r2.extra, r2.back += r2.extra;
                }
                if (r2.offset > r2.dmax) {
                  e2.msg = "invalid distance too far back", r2.mode = 30;
                  break;
                }
                r2.mode = 25;
              case 25:
                if (0 === h2) break e;
                if (d = c2 - h2, r2.offset > d) {
                  if ((d = r2.offset - d) > r2.whave && r2.sane) {
                    e2.msg = "invalid distance too far back", r2.mode = 30;
                    break;
                  }
                  p = d > r2.wnext ? (d -= r2.wnext, r2.wsize - d) : r2.wnext - d, d > r2.length && (d = r2.length), m = r2.window;
                } else m = i2, p = a2 - r2.offset, d = r2.length;
                for (h2 < d && (d = h2), h2 -= d, r2.length -= d; i2[a2++] = m[p++], --d; ) ;
                0 === r2.length && (r2.mode = 21);
                break;
              case 26:
                if (0 === h2) break e;
                i2[a2++] = r2.length, h2--, r2.mode = 21;
                break;
              case 27:
                if (r2.wrap) {
                  for (; l2 < 32; ) {
                    if (0 === o2) break e;
                    o2--, u2 |= n2[s2++] << l2, l2 += 8;
                  }
                  if (c2 -= h2, e2.total_out += c2, r2.total += c2, c2 && (e2.adler = r2.check = r2.flags ? B(r2.check, i2, c2, a2 - c2) : O(r2.check, i2, c2, a2 - c2)), c2 = h2, (r2.flags ? u2 : L2(u2)) !== r2.check) {
                    e2.msg = "incorrect data check", r2.mode = 30;
                    break;
                  }
                  l2 = u2 = 0;
                }
                r2.mode = 28;
              case 28:
                if (r2.wrap && r2.flags) {
                  for (; l2 < 32; ) {
                    if (0 === o2) break e;
                    o2--, u2 += n2[s2++] << l2, l2 += 8;
                  }
                  if (u2 !== (4294967295 & r2.total)) {
                    e2.msg = "incorrect length check", r2.mode = 30;
                    break;
                  }
                  l2 = u2 = 0;
                }
                r2.mode = 29;
              case 29:
                x = 1;
                break e;
              case 30:
                x = -3;
                break e;
              case 31:
                return -4;
              case 32:
              default:
                return U;
            }
            return e2.next_out = a2, e2.avail_out = h2, e2.next_in = s2, e2.avail_in = o2, r2.hold = u2, r2.bits = l2, (r2.wsize || c2 !== e2.avail_out && r2.mode < 30 && (r2.mode < 27 || 4 !== t2)) && Z(e2, e2.output, e2.next_out, c2 - e2.avail_out) ? (r2.mode = 31, -4) : (f2 -= e2.avail_in, c2 -= e2.avail_out, e2.total_in += f2, e2.total_out += c2, r2.total += c2, r2.wrap && c2 && (e2.adler = r2.check = r2.flags ? B(r2.check, i2, c2, e2.next_out - c2) : O(r2.check, i2, c2, e2.next_out - c2)), e2.data_type = r2.bits + (r2.last ? 64 : 0) + (12 === r2.mode ? 128 : 0) + (20 === r2.mode || 15 === r2.mode ? 256 : 0), (0 == f2 && 0 === c2 || 4 === t2) && x === N && (x = -5), x);
          }, r.inflateEnd = function(e2) {
            if (!e2 || !e2.state) return U;
            var t2 = e2.state;
            return t2.window && (t2.window = null), e2.state = null, N;
          }, r.inflateGetHeader = function(e2, t2) {
            var r2;
            return e2 && e2.state ? 0 == (2 & (r2 = e2.state).wrap) ? U : ((r2.head = t2).done = false, N) : U;
          }, r.inflateSetDictionary = function(e2, t2) {
            var r2, n2 = t2.length;
            return e2 && e2.state ? 0 !== (r2 = e2.state).wrap && 11 !== r2.mode ? U : 11 === r2.mode && O(1, t2, n2, 0) !== r2.check ? -3 : Z(e2, t2, n2, n2) ? (r2.mode = 31, -4) : (r2.havedict = 1, N) : U;
          }, r.inflateInfo = "pako inflate (from Nodeca project)";
        }, { "../utils/common": 41, "./adler32": 43, "./crc32": 45, "./inffast": 48, "./inftrees": 50 }], 50: [function(e, t, r) {
          "use strict";
          var D2 = e("../utils/common"), F = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258, 0, 0], N = [16, 16, 16, 16, 16, 16, 16, 16, 17, 17, 17, 17, 18, 18, 18, 18, 19, 19, 19, 19, 20, 20, 20, 20, 21, 21, 21, 21, 16, 72, 78], U = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577, 0, 0], P = [16, 16, 16, 16, 17, 17, 18, 18, 19, 19, 20, 20, 21, 21, 22, 22, 23, 23, 24, 24, 25, 25, 26, 26, 27, 27, 28, 28, 29, 29, 64, 64];
          t.exports = function(e2, t2, r2, n, i, s, a, o) {
            var h, u, l, f, c, d, p, m, _, g = o.bits, b = 0, v = 0, y = 0, w = 0, k = 0, x = 0, S = 0, z = 0, C = 0, E = 0, A = null, I = 0, O = new D2.Buf16(16), B = new D2.Buf16(16), R = null, T = 0;
            for (b = 0; b <= 15; b++) O[b] = 0;
            for (v = 0; v < n; v++) O[t2[r2 + v]]++;
            for (k = g, w = 15; 1 <= w && 0 === O[w]; w--) ;
            if (w < k && (k = w), 0 === w) return i[s++] = 20971520, i[s++] = 20971520, o.bits = 1, 0;
            for (y = 1; y < w && 0 === O[y]; y++) ;
            for (k < y && (k = y), b = z = 1; b <= 15; b++) if (z <<= 1, (z -= O[b]) < 0) return -1;
            if (0 < z && (0 === e2 || 1 !== w)) return -1;
            for (B[1] = 0, b = 1; b < 15; b++) B[b + 1] = B[b] + O[b];
            for (v = 0; v < n; v++) 0 !== t2[r2 + v] && (a[B[t2[r2 + v]]++] = v);
            if (d = 0 === e2 ? (A = R = a, 19) : 1 === e2 ? (A = F, I -= 257, R = N, T -= 257, 256) : (A = U, R = P, -1), b = y, c = s, S = v = E = 0, l = -1, f = (C = 1 << (x = k)) - 1, 1 === e2 && 852 < C || 2 === e2 && 592 < C) return 1;
            for (; ; ) {
              for (p = b - S, _ = a[v] < d ? (m = 0, a[v]) : a[v] > d ? (m = R[T + a[v]], A[I + a[v]]) : (m = 96, 0), h = 1 << b - S, y = u = 1 << x; i[c + (E >> S) + (u -= h)] = p << 24 | m << 16 | _ | 0, 0 !== u; ) ;
              for (h = 1 << b - 1; E & h; ) h >>= 1;
              if (0 !== h ? (E &= h - 1, E += h) : E = 0, v++, 0 == --O[b]) {
                if (b === w) break;
                b = t2[r2 + a[v]];
              }
              if (k < b && (E & f) !== l) {
                for (0 === S && (S = k), c += y, z = 1 << (x = b - S); x + S < w && !((z -= O[x + S]) <= 0); ) x++, z <<= 1;
                if (C += 1 << x, 1 === e2 && 852 < C || 2 === e2 && 592 < C) return 1;
                i[l = E & f] = k << 24 | x << 16 | c - s | 0;
              }
            }
            return 0 !== E && (i[c + E] = b - S << 24 | 64 << 16 | 0), o.bits = k, 0;
          };
        }, { "../utils/common": 41 }], 51: [function(e, t, r) {
          "use strict";
          t.exports = { 2: "need dictionary", 1: "stream end", 0: "", "-1": "file error", "-2": "stream error", "-3": "data error", "-4": "insufficient memory", "-5": "buffer error", "-6": "incompatible version" };
        }, {}], 52: [function(e, t, r) {
          "use strict";
          var i = e("../utils/common"), o = 0, h = 1;
          function n(e2) {
            for (var t2 = e2.length; 0 <= --t2; ) e2[t2] = 0;
          }
          var s = 0, a = 29, u = 256, l = u + 1 + a, f = 30, c = 19, _ = 2 * l + 1, g = 15, d = 16, p = 7, m = 256, b = 16, v = 17, y = 18, w = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0], k = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13], x = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 7], S = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15], z = new Array(2 * (l + 2));
          n(z);
          var C = new Array(2 * f);
          n(C);
          var E = new Array(512);
          n(E);
          var A = new Array(256);
          n(A);
          var I = new Array(a);
          n(I);
          var O, B, R, T = new Array(f);
          function D2(e2, t2, r2, n2, i2) {
            this.static_tree = e2, this.extra_bits = t2, this.extra_base = r2, this.elems = n2, this.max_length = i2, this.has_stree = e2 && e2.length;
          }
          function F(e2, t2) {
            this.dyn_tree = e2, this.max_code = 0, this.stat_desc = t2;
          }
          function N(e2) {
            return e2 < 256 ? E[e2] : E[256 + (e2 >>> 7)];
          }
          function U(e2, t2) {
            e2.pending_buf[e2.pending++] = 255 & t2, e2.pending_buf[e2.pending++] = t2 >>> 8 & 255;
          }
          function P(e2, t2, r2) {
            e2.bi_valid > d - r2 ? (e2.bi_buf |= t2 << e2.bi_valid & 65535, U(e2, e2.bi_buf), e2.bi_buf = t2 >> d - e2.bi_valid, e2.bi_valid += r2 - d) : (e2.bi_buf |= t2 << e2.bi_valid & 65535, e2.bi_valid += r2);
          }
          function L2(e2, t2, r2) {
            P(e2, r2[2 * t2], r2[2 * t2 + 1]);
          }
          function j(e2, t2) {
            for (var r2 = 0; r2 |= 1 & e2, e2 >>>= 1, r2 <<= 1, 0 < --t2; ) ;
            return r2 >>> 1;
          }
          function Z(e2, t2, r2) {
            var n2, i2, s2 = new Array(g + 1), a2 = 0;
            for (n2 = 1; n2 <= g; n2++) s2[n2] = a2 = a2 + r2[n2 - 1] << 1;
            for (i2 = 0; i2 <= t2; i2++) {
              var o2 = e2[2 * i2 + 1];
              0 !== o2 && (e2[2 * i2] = j(s2[o2]++, o2));
            }
          }
          function W(e2) {
            var t2;
            for (t2 = 0; t2 < l; t2++) e2.dyn_ltree[2 * t2] = 0;
            for (t2 = 0; t2 < f; t2++) e2.dyn_dtree[2 * t2] = 0;
            for (t2 = 0; t2 < c; t2++) e2.bl_tree[2 * t2] = 0;
            e2.dyn_ltree[2 * m] = 1, e2.opt_len = e2.static_len = 0, e2.last_lit = e2.matches = 0;
          }
          function M(e2) {
            8 < e2.bi_valid ? U(e2, e2.bi_buf) : 0 < e2.bi_valid && (e2.pending_buf[e2.pending++] = e2.bi_buf), e2.bi_buf = 0, e2.bi_valid = 0;
          }
          function H(e2, t2, r2, n2) {
            var i2 = 2 * t2, s2 = 2 * r2;
            return e2[i2] < e2[s2] || e2[i2] === e2[s2] && n2[t2] <= n2[r2];
          }
          function G(e2, t2, r2) {
            for (var n2 = e2.heap[r2], i2 = r2 << 1; i2 <= e2.heap_len && (i2 < e2.heap_len && H(t2, e2.heap[i2 + 1], e2.heap[i2], e2.depth) && i2++, !H(t2, n2, e2.heap[i2], e2.depth)); ) e2.heap[r2] = e2.heap[i2], r2 = i2, i2 <<= 1;
            e2.heap[r2] = n2;
          }
          function K(e2, t2, r2) {
            var n2, i2, s2, a2, o2 = 0;
            if (0 !== e2.last_lit) for (; n2 = e2.pending_buf[e2.d_buf + 2 * o2] << 8 | e2.pending_buf[e2.d_buf + 2 * o2 + 1], i2 = e2.pending_buf[e2.l_buf + o2], o2++, 0 === n2 ? L2(e2, i2, t2) : (L2(e2, (s2 = A[i2]) + u + 1, t2), 0 !== (a2 = w[s2]) && P(e2, i2 -= I[s2], a2), L2(e2, s2 = N(--n2), r2), 0 !== (a2 = k[s2]) && P(e2, n2 -= T[s2], a2)), o2 < e2.last_lit; ) ;
            L2(e2, m, t2);
          }
          function Y(e2, t2) {
            var r2, n2, i2, s2 = t2.dyn_tree, a2 = t2.stat_desc.static_tree, o2 = t2.stat_desc.has_stree, h2 = t2.stat_desc.elems, u2 = -1;
            for (e2.heap_len = 0, e2.heap_max = _, r2 = 0; r2 < h2; r2++) 0 !== s2[2 * r2] ? (e2.heap[++e2.heap_len] = u2 = r2, e2.depth[r2] = 0) : s2[2 * r2 + 1] = 0;
            for (; e2.heap_len < 2; ) s2[2 * (i2 = e2.heap[++e2.heap_len] = u2 < 2 ? ++u2 : 0)] = 1, e2.depth[i2] = 0, e2.opt_len--, o2 && (e2.static_len -= a2[2 * i2 + 1]);
            for (t2.max_code = u2, r2 = e2.heap_len >> 1; 1 <= r2; r2--) G(e2, s2, r2);
            for (i2 = h2; r2 = e2.heap[1], e2.heap[1] = e2.heap[e2.heap_len--], G(e2, s2, 1), n2 = e2.heap[1], e2.heap[--e2.heap_max] = r2, e2.heap[--e2.heap_max] = n2, s2[2 * i2] = s2[2 * r2] + s2[2 * n2], e2.depth[i2] = (e2.depth[r2] >= e2.depth[n2] ? e2.depth[r2] : e2.depth[n2]) + 1, s2[2 * r2 + 1] = s2[2 * n2 + 1] = i2, e2.heap[1] = i2++, G(e2, s2, 1), 2 <= e2.heap_len; ) ;
            e2.heap[--e2.heap_max] = e2.heap[1], function(e3, t3) {
              var r3, n3, i3, s3, a3, o3, h3 = t3.dyn_tree, u3 = t3.max_code, l2 = t3.stat_desc.static_tree, f2 = t3.stat_desc.has_stree, c2 = t3.stat_desc.extra_bits, d2 = t3.stat_desc.extra_base, p2 = t3.stat_desc.max_length, m2 = 0;
              for (s3 = 0; s3 <= g; s3++) e3.bl_count[s3] = 0;
              for (h3[2 * e3.heap[e3.heap_max] + 1] = 0, r3 = e3.heap_max + 1; r3 < _; r3++) p2 < (s3 = h3[2 * h3[2 * (n3 = e3.heap[r3]) + 1] + 1] + 1) && (s3 = p2, m2++), h3[2 * n3 + 1] = s3, u3 < n3 || (e3.bl_count[s3]++, a3 = 0, d2 <= n3 && (a3 = c2[n3 - d2]), o3 = h3[2 * n3], e3.opt_len += o3 * (s3 + a3), f2 && (e3.static_len += o3 * (l2[2 * n3 + 1] + a3)));
              if (0 !== m2) {
                do {
                  for (s3 = p2 - 1; 0 === e3.bl_count[s3]; ) s3--;
                  e3.bl_count[s3]--, e3.bl_count[s3 + 1] += 2, e3.bl_count[p2]--, m2 -= 2;
                } while (0 < m2);
                for (s3 = p2; 0 !== s3; s3--) for (n3 = e3.bl_count[s3]; 0 !== n3; ) u3 < (i3 = e3.heap[--r3]) || (h3[2 * i3 + 1] !== s3 && (e3.opt_len += (s3 - h3[2 * i3 + 1]) * h3[2 * i3], h3[2 * i3 + 1] = s3), n3--);
              }
            }(e2, t2), Z(s2, u2, e2.bl_count);
          }
          function X(e2, t2, r2) {
            var n2, i2, s2 = -1, a2 = t2[1], o2 = 0, h2 = 7, u2 = 4;
            for (0 === a2 && (h2 = 138, u2 = 3), t2[2 * (r2 + 1) + 1] = 65535, n2 = 0; n2 <= r2; n2++) i2 = a2, a2 = t2[2 * (n2 + 1) + 1], ++o2 < h2 && i2 === a2 || (o2 < u2 ? e2.bl_tree[2 * i2] += o2 : 0 !== i2 ? (i2 !== s2 && e2.bl_tree[2 * i2]++, e2.bl_tree[2 * b]++) : o2 <= 10 ? e2.bl_tree[2 * v]++ : e2.bl_tree[2 * y]++, s2 = i2, u2 = (o2 = 0) === a2 ? (h2 = 138, 3) : i2 === a2 ? (h2 = 6, 3) : (h2 = 7, 4));
          }
          function V(e2, t2, r2) {
            var n2, i2, s2 = -1, a2 = t2[1], o2 = 0, h2 = 7, u2 = 4;
            for (0 === a2 && (h2 = 138, u2 = 3), n2 = 0; n2 <= r2; n2++) if (i2 = a2, a2 = t2[2 * (n2 + 1) + 1], !(++o2 < h2 && i2 === a2)) {
              if (o2 < u2) for (; L2(e2, i2, e2.bl_tree), 0 != --o2; ) ;
              else 0 !== i2 ? (i2 !== s2 && (L2(e2, i2, e2.bl_tree), o2--), L2(e2, b, e2.bl_tree), P(e2, o2 - 3, 2)) : o2 <= 10 ? (L2(e2, v, e2.bl_tree), P(e2, o2 - 3, 3)) : (L2(e2, y, e2.bl_tree), P(e2, o2 - 11, 7));
              s2 = i2, u2 = (o2 = 0) === a2 ? (h2 = 138, 3) : i2 === a2 ? (h2 = 6, 3) : (h2 = 7, 4);
            }
          }
          n(T);
          var q = false;
          function J(e2, t2, r2, n2) {
            P(e2, (s << 1) + (n2 ? 1 : 0), 3), function(e3, t3, r3, n3) {
              M(e3), n3 && (U(e3, r3), U(e3, ~r3)), i.arraySet(e3.pending_buf, e3.window, t3, r3, e3.pending), e3.pending += r3;
            }(e2, t2, r2, true);
          }
          r._tr_init = function(e2) {
            q || (function() {
              var e3, t2, r2, n2, i2, s2 = new Array(g + 1);
              for (n2 = r2 = 0; n2 < a - 1; n2++) for (I[n2] = r2, e3 = 0; e3 < 1 << w[n2]; e3++) A[r2++] = n2;
              for (A[r2 - 1] = n2, n2 = i2 = 0; n2 < 16; n2++) for (T[n2] = i2, e3 = 0; e3 < 1 << k[n2]; e3++) E[i2++] = n2;
              for (i2 >>= 7; n2 < f; n2++) for (T[n2] = i2 << 7, e3 = 0; e3 < 1 << k[n2] - 7; e3++) E[256 + i2++] = n2;
              for (t2 = 0; t2 <= g; t2++) s2[t2] = 0;
              for (e3 = 0; e3 <= 143; ) z[2 * e3 + 1] = 8, e3++, s2[8]++;
              for (; e3 <= 255; ) z[2 * e3 + 1] = 9, e3++, s2[9]++;
              for (; e3 <= 279; ) z[2 * e3 + 1] = 7, e3++, s2[7]++;
              for (; e3 <= 287; ) z[2 * e3 + 1] = 8, e3++, s2[8]++;
              for (Z(z, l + 1, s2), e3 = 0; e3 < f; e3++) C[2 * e3 + 1] = 5, C[2 * e3] = j(e3, 5);
              O = new D2(z, w, u + 1, l, g), B = new D2(C, k, 0, f, g), R = new D2(new Array(0), x, 0, c, p);
            }(), q = true), e2.l_desc = new F(e2.dyn_ltree, O), e2.d_desc = new F(e2.dyn_dtree, B), e2.bl_desc = new F(e2.bl_tree, R), e2.bi_buf = 0, e2.bi_valid = 0, W(e2);
          }, r._tr_stored_block = J, r._tr_flush_block = function(e2, t2, r2, n2) {
            var i2, s2, a2 = 0;
            0 < e2.level ? (2 === e2.strm.data_type && (e2.strm.data_type = function(e3) {
              var t3, r3 = 4093624447;
              for (t3 = 0; t3 <= 31; t3++, r3 >>>= 1) if (1 & r3 && 0 !== e3.dyn_ltree[2 * t3]) return o;
              if (0 !== e3.dyn_ltree[18] || 0 !== e3.dyn_ltree[20] || 0 !== e3.dyn_ltree[26]) return h;
              for (t3 = 32; t3 < u; t3++) if (0 !== e3.dyn_ltree[2 * t3]) return h;
              return o;
            }(e2)), Y(e2, e2.l_desc), Y(e2, e2.d_desc), a2 = function(e3) {
              var t3;
              for (X(e3, e3.dyn_ltree, e3.l_desc.max_code), X(e3, e3.dyn_dtree, e3.d_desc.max_code), Y(e3, e3.bl_desc), t3 = c - 1; 3 <= t3 && 0 === e3.bl_tree[2 * S[t3] + 1]; t3--) ;
              return e3.opt_len += 3 * (t3 + 1) + 5 + 5 + 4, t3;
            }(e2), i2 = e2.opt_len + 3 + 7 >>> 3, (s2 = e2.static_len + 3 + 7 >>> 3) <= i2 && (i2 = s2)) : i2 = s2 = r2 + 5, r2 + 4 <= i2 && -1 !== t2 ? J(e2, t2, r2, n2) : 4 === e2.strategy || s2 === i2 ? (P(e2, 2 + (n2 ? 1 : 0), 3), K(e2, z, C)) : (P(e2, 4 + (n2 ? 1 : 0), 3), function(e3, t3, r3, n3) {
              var i3;
              for (P(e3, t3 - 257, 5), P(e3, r3 - 1, 5), P(e3, n3 - 4, 4), i3 = 0; i3 < n3; i3++) P(e3, e3.bl_tree[2 * S[i3] + 1], 3);
              V(e3, e3.dyn_ltree, t3 - 1), V(e3, e3.dyn_dtree, r3 - 1);
            }(e2, e2.l_desc.max_code + 1, e2.d_desc.max_code + 1, a2 + 1), K(e2, e2.dyn_ltree, e2.dyn_dtree)), W(e2), n2 && M(e2);
          }, r._tr_tally = function(e2, t2, r2) {
            return e2.pending_buf[e2.d_buf + 2 * e2.last_lit] = t2 >>> 8 & 255, e2.pending_buf[e2.d_buf + 2 * e2.last_lit + 1] = 255 & t2, e2.pending_buf[e2.l_buf + e2.last_lit] = 255 & r2, e2.last_lit++, 0 === t2 ? e2.dyn_ltree[2 * r2]++ : (e2.matches++, t2--, e2.dyn_ltree[2 * (A[r2] + u + 1)]++, e2.dyn_dtree[2 * N(t2)]++), e2.last_lit === e2.lit_bufsize - 1;
          }, r._tr_align = function(e2) {
            P(e2, 2, 3), L2(e2, m, z), function(e3) {
              16 === e3.bi_valid ? (U(e3, e3.bi_buf), e3.bi_buf = 0, e3.bi_valid = 0) : 8 <= e3.bi_valid && (e3.pending_buf[e3.pending++] = 255 & e3.bi_buf, e3.bi_buf >>= 8, e3.bi_valid -= 8);
            }(e2);
          };
        }, { "../utils/common": 41 }], 53: [function(e, t, r) {
          "use strict";
          t.exports = function() {
            this.input = null, this.next_in = 0, this.avail_in = 0, this.total_in = 0, this.output = null, this.next_out = 0, this.avail_out = 0, this.total_out = 0, this.msg = "", this.state = null, this.data_type = 2, this.adler = 0;
          };
        }, {}], 54: [function(e, t, r) {
          (function(e2) {
            !function(r2, n) {
              "use strict";
              if (!r2.setImmediate) {
                var i, s, t2, a, o = 1, h = {}, u = false, l = r2.document, e3 = Object.getPrototypeOf && Object.getPrototypeOf(r2);
                e3 = e3 && e3.setTimeout ? e3 : r2, i = "[object process]" === {}.toString.call(r2.process) ? function(e4) {
                  process.nextTick(function() {
                    c(e4);
                  });
                } : function() {
                  if (r2.postMessage && !r2.importScripts) {
                    var e4 = true, t3 = r2.onmessage;
                    return r2.onmessage = function() {
                      e4 = false;
                    }, r2.postMessage("", "*"), r2.onmessage = t3, e4;
                  }
                }() ? (a = "setImmediate$" + Math.random() + "$", r2.addEventListener ? r2.addEventListener("message", d, false) : r2.attachEvent("onmessage", d), function(e4) {
                  r2.postMessage(a + e4, "*");
                }) : r2.MessageChannel ? ((t2 = new MessageChannel()).port1.onmessage = function(e4) {
                  c(e4.data);
                }, function(e4) {
                  t2.port2.postMessage(e4);
                }) : l && "onreadystatechange" in l.createElement("script") ? (s = l.documentElement, function(e4) {
                  var t3 = l.createElement("script");
                  t3.onreadystatechange = function() {
                    c(e4), t3.onreadystatechange = null, s.removeChild(t3), t3 = null;
                  }, s.appendChild(t3);
                }) : function(e4) {
                  setTimeout(c, 0, e4);
                }, e3.setImmediate = function(e4) {
                  "function" != typeof e4 && (e4 = new Function("" + e4));
                  for (var t3 = new Array(arguments.length - 1), r3 = 0; r3 < t3.length; r3++) t3[r3] = arguments[r3 + 1];
                  var n2 = { callback: e4, args: t3 };
                  return h[o] = n2, i(o), o++;
                }, e3.clearImmediate = f;
              }
              function f(e4) {
                delete h[e4];
              }
              function c(e4) {
                if (u) setTimeout(c, 0, e4);
                else {
                  var t3 = h[e4];
                  if (t3) {
                    u = true;
                    try {
                      !function(e5) {
                        var t4 = e5.callback, r3 = e5.args;
                        switch (r3.length) {
                          case 0:
                            t4();
                            break;
                          case 1:
                            t4(r3[0]);
                            break;
                          case 2:
                            t4(r3[0], r3[1]);
                            break;
                          case 3:
                            t4(r3[0], r3[1], r3[2]);
                            break;
                          default:
                            t4.apply(n, r3);
                        }
                      }(t3);
                    } finally {
                      f(e4), u = false;
                    }
                  }
                }
              }
              function d(e4) {
                e4.source === r2 && "string" == typeof e4.data && 0 === e4.data.indexOf(a) && c(+e4.data.slice(a.length));
              }
            }("undefined" == typeof self ? void 0 === e2 ? this : e2 : self);
          }).call(this, "undefined" != typeof global ? global : "undefined" != typeof self ? self : "undefined" != typeof window ? window : {});
        }, {}] }, {}, [10])(10);
      });
    }
  });

  // ../../../tmp/pptx-spike/src/node-shims.ts
  function createHash(_algo) {
    const chunks = [];
    return {
      update(data) {
        chunks.push(data);
        return this;
      },
      digest(_enc) {
        let h = 2166136261;
        for (const c of chunks) for (let i = 0; i < c.length; i++) h = (h ^ c[i]) * 16777619 >>> 0;
        return (h.toString(16) + "0".repeat(60)).slice(0, 64);
      }
    };
  }
  var init_node_shims = __esm({
    "../../../tmp/pptx-spike/src/node-shims.ts"() {
    }
  });

  // src/media.ts
  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var B64_LOOKUP = /* @__PURE__ */ (() => {
    const t = new Uint8Array(256);
    for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
    return t;
  })();
  function base64Encode(bytes) {
    let out = "";
    const n = bytes.length;
    for (let i = 0; i < n; i += 3) {
      const b0 = bytes[i];
      const b1 = i + 1 < n ? bytes[i + 1] : 0;
      const b2 = i + 2 < n ? bytes[i + 2] : 0;
      out += B64[b0 >> 2];
      out += B64[(b0 & 3) << 4 | b1 >> 4];
      out += i + 1 < n ? B64[(b1 & 15) << 2 | b2 >> 6] : "=";
      out += i + 2 < n ? B64[b2 & 63] : "=";
      if (out.length % 65536 < 4) {
      }
    }
    return out;
  }
  function base64Decode(s) {
    const clean = s.replace(/[^A-Za-z0-9+/]/g, "");
    const len = clean.length * 3 >> 2;
    const out = new Uint8Array(len);
    let p = 0;
    for (let i = 0; i < clean.length; i += 4) {
      const n = B64_LOOKUP[clean.charCodeAt(i)] << 18 | B64_LOOKUP[clean.charCodeAt(i + 1)] << 12 | B64_LOOKUP[clean.charCodeAt(i + 2)] << 6 | B64_LOOKUP[clean.charCodeAt(i + 3)];
      if (p < len) out[p++] = n >> 16 & 255;
      if (p < len) out[p++] = n >> 8 & 255;
      if (p < len) out[p++] = n & 255;
    }
    return out;
  }
  var MIME = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    webp: "image/webp",
    tiff: "image/tiff",
    emf: "image/emf",
    wmf: "image/wmf"
  };
  function dataUrlFor(ref, bytes) {
    const ext = (ref.split(".").pop() ?? "").toLowerCase();
    return `data:${MIME[ext] ?? "application/octet-stream"};base64,${base64Encode(bytes)}`;
  }
  function createMediaResolver(opened) {
    const entries = opened?.archive?.entries;
    const cache2 = /* @__PURE__ */ new Map();
    const missing = /* @__PURE__ */ new Set();
    const resolve = (ref) => {
      if (cache2.has(ref)) return cache2.get(ref) || void 0;
      let data = opened?.archive?.readBytes?.(ref);
      if (!data && entries) {
        const base = ref.split("/").pop().toLowerCase();
        for (const [p, b] of entries) {
          if (p.toLowerCase().endsWith("/" + base) || p.toLowerCase() === base) {
            data = b;
            break;
          }
        }
      }
      if (!data) {
        missing.add(ref);
        cache2.set(ref, "");
        return void 0;
      }
      const url = dataUrlFor(ref, data);
      cache2.set(ref, url);
      return url;
    };
    return { resolve, missing };
  }

  // src/buffer-shim.ts
  var UTF8 = new TextEncoder();
  var UTF8_DEC = new TextDecoder("utf-8");
  var LATIN1_DEC = new TextDecoder("latin1");
  var HEX = "0123456789abcdef";
  function bytesFromLatin1(s) {
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 255;
    return out;
  }
  function toBytes(input, enc, byteOffset, length) {
    if (typeof input === "string") {
      const e = (enc ?? "utf8").toLowerCase();
      if (e === "base64") return base64Decode(input);
      if (e === "hex") {
        const n = input.length >> 1;
        const out = new Uint8Array(n);
        for (let i = 0; i < n; i++) out[i] = parseInt(input.substr(i * 2, 2), 16);
        return out;
      }
      if (e === "binary" || e === "latin1") return bytesFromLatin1(input);
      return UTF8.encode(input);
    }
    if (input instanceof ArrayBuffer) {
      return new Uint8Array(input, byteOffset ?? 0, length ?? input.byteLength - (byteOffset ?? 0));
    }
    if (ArrayBuffer.isView(input)) {
      return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    }
    if (input == null) return new Uint8Array(0);
    if (typeof input === "number") return new Uint8Array(input);
    return new Uint8Array(input);
  }
  var Buffer2 = class _Buffer extends Uint8Array {
    static from(input, enc, length) {
      if (typeof enc === "number" || enc === void 0) {
        const off = typeof enc === "number" ? enc : void 0;
        const b2 = toBytes(input, void 0, off, length);
        return new _Buffer(b2.buffer.slice(b2.byteOffset, b2.byteOffset + b2.byteLength));
      }
      const b = toBytes(input, enc);
      return new _Buffer(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    }
    static alloc(size, fill = 0) {
      const b = new _Buffer(size);
      if (fill) b.fill(fill);
      return b;
    }
    static allocUnsafe(size) {
      return new _Buffer(size);
    }
    static concat(list, totalLength) {
      const arrs = Array.from(list);
      const total = totalLength ?? arrs.reduce((n, a) => n + a.length, 0);
      const out = new _Buffer(total);
      let off = 0;
      for (const a of arrs) {
        out.set(a.subarray(0, Math.max(0, Math.min(a.length, total - off))), off);
        off += a.length;
      }
      return out;
    }
    static isBuffer(x) {
      return x instanceof Uint8Array;
    }
    static byteLength(input, enc) {
      return typeof input === "string" ? toBytes(input, enc).length : input.byteLength;
    }
    toString(enc = "utf8") {
      const e = enc.toLowerCase();
      if (e === "base64") return base64Encode(this);
      if (e === "binary" || e === "latin1") return LATIN1_DEC.decode(this);
      if (e === "hex") {
        let s = "";
        for (let i = 0; i < this.length; i++) s += HEX[this[i] >> 4] + HEX[this[i] & 15];
        return s;
      }
      return UTF8_DEC.decode(this);
    }
    equals(other) {
      if (this.length !== other.length) return false;
      for (let i = 0; i < this.length; i++) if (this[i] !== other[i]) return false;
      return true;
    }
    /** Uint8Array#includes is inherited; kept explicit for clarity in Buffer-shaped call sites. */
    includes(value, fromIndex) {
      if (typeof value === "number") return super.includes(value, fromIndex);
      const needle = value;
      if (!needle.length) return true;
      outer: for (let i = fromIndex ?? 0; i <= this.length - needle.length; i++) {
        for (let j = 0; j < needle.length; j++) if (this[i + j] !== needle[j]) continue outer;
        return true;
      }
      return false;
    }
  };

  // ../../../tmp/genoffice/packages/pptx-engine/src/index.ts
  var import_jszip4 = __toESM(require_jszip_min());

  // ../genoffice/packages/pptx-engine/src/zip.ts
  var import_jszip = __toESM(require_jszip_min(), 1);
  init_node_shims();

  // node_modules/fast-xml-parser/src/util.js
  var nameStartChar = ":A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD";
  var nameChar = nameStartChar + "\\-.\\d\\u00B7\\u0300-\\u036F\\u203F-\\u2040";
  var nameRegexp = "[" + nameStartChar + "][" + nameChar + "]*";
  var regexName = new RegExp("^" + nameRegexp + "$");
  function getAllMatches(string, regex) {
    const matches = [];
    let match = regex.exec(string);
    while (match) {
      const allmatches = [];
      allmatches.startIndex = regex.lastIndex - match[0].length;
      const len = match.length;
      for (let index = 0; index < len; index++) {
        allmatches.push(match[index]);
      }
      matches.push(allmatches);
      match = regex.exec(string);
    }
    return matches;
  }
  var isName = function(string) {
    const match = regexName.exec(string);
    return !(match === null || typeof match === "undefined");
  };
  function isExist(v) {
    return typeof v !== "undefined";
  }
  var DANGEROUS_PROPERTY_NAMES = [
    // '__proto__',
    // 'constructor',
    // 'prototype',
    "hasOwnProperty",
    "toString",
    "valueOf",
    "__defineGetter__",
    "__defineSetter__",
    "__lookupGetter__",
    "__lookupSetter__"
  ];
  var criticalProperties = ["__proto__", "constructor", "prototype"];

  // node_modules/fast-xml-parser/src/validator.js
  var defaultOptions = {
    allowBooleanAttributes: false,
    //A tag can have attributes without any value
    unpairedTags: []
  };
  function validate(xmlData, options) {
    options = Object.assign({}, defaultOptions, options);
    const tags = [];
    let tagFound = false;
    let reachedRoot = false;
    if (xmlData[0] === "\uFEFF") {
      xmlData = xmlData.substr(1);
    }
    for (let i = 0; i < xmlData.length; i++) {
      if (xmlData[i] === "<" && xmlData[i + 1] === "?") {
        i += 2;
        i = readPI(xmlData, i);
        if (i.err) return i;
      } else if (xmlData[i] === "<") {
        let tagStartPos = i;
        i++;
        if (xmlData[i] === "!") {
          i = readCommentAndCDATA(xmlData, i);
          continue;
        } else {
          let closingTag = false;
          if (xmlData[i] === "/") {
            closingTag = true;
            i++;
          }
          let tagName = "";
          for (; i < xmlData.length && xmlData[i] !== ">" && xmlData[i] !== " " && xmlData[i] !== "	" && xmlData[i] !== "\n" && xmlData[i] !== "\r"; i++) {
            tagName += xmlData[i];
          }
          tagName = tagName.trim();
          if (tagName[tagName.length - 1] === "/") {
            tagName = tagName.substring(0, tagName.length - 1);
            i--;
          }
          if (!validateTagName(tagName)) {
            let msg;
            if (tagName.trim().length === 0) {
              msg = "Invalid space after '<'.";
            } else {
              msg = "Tag '" + tagName + "' is an invalid name.";
            }
            return getErrorObject("InvalidTag", msg, getLineNumberForPosition(xmlData, i));
          }
          const result = readAttributeStr(xmlData, i);
          if (result === false) {
            return getErrorObject("InvalidAttr", "Attributes for '" + tagName + "' have open quote.", getLineNumberForPosition(xmlData, i));
          }
          let attrStr = result.value;
          i = result.index;
          if (attrStr[attrStr.length - 1] === "/") {
            const attrStrStart = i - attrStr.length;
            attrStr = attrStr.substring(0, attrStr.length - 1);
            const isValid = validateAttributeString(attrStr, options);
            if (isValid === true) {
              tagFound = true;
            } else {
              return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, attrStrStart + isValid.err.line));
            }
          } else if (closingTag) {
            if (!result.tagClosed) {
              return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' doesn't have proper closing.", getLineNumberForPosition(xmlData, i));
            } else if (attrStr.trim().length > 0) {
              return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' can't have attributes or invalid starting.", getLineNumberForPosition(xmlData, tagStartPos));
            } else if (tags.length === 0) {
              return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' has not been opened.", getLineNumberForPosition(xmlData, tagStartPos));
            } else {
              const otg = tags.pop();
              if (tagName !== otg.tagName) {
                let openPos = getLineNumberForPosition(xmlData, otg.tagStartPos);
                return getErrorObject(
                  "InvalidTag",
                  "Expected closing tag '" + otg.tagName + "' (opened in line " + openPos.line + ", col " + openPos.col + ") instead of closing tag '" + tagName + "'.",
                  getLineNumberForPosition(xmlData, tagStartPos)
                );
              }
              if (tags.length == 0) {
                reachedRoot = true;
              }
            }
          } else {
            const isValid = validateAttributeString(attrStr, options);
            if (isValid !== true) {
              return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, i - attrStr.length + isValid.err.line));
            }
            if (reachedRoot === true) {
              return getErrorObject("InvalidXml", "Multiple possible root nodes found.", getLineNumberForPosition(xmlData, i));
            } else if (options.unpairedTags.indexOf(tagName) !== -1) {
            } else {
              tags.push({ tagName, tagStartPos });
            }
            tagFound = true;
          }
          for (i++; i < xmlData.length; i++) {
            if (xmlData[i] === "<") {
              if (xmlData[i + 1] === "!") {
                i++;
                i = readCommentAndCDATA(xmlData, i);
                continue;
              } else if (xmlData[i + 1] === "?") {
                i = readPI(xmlData, ++i);
                if (i.err) return i;
              } else {
                break;
              }
            } else if (xmlData[i] === "&") {
              const afterAmp = validateAmpersand(xmlData, i);
              if (afterAmp == -1)
                return getErrorObject("InvalidChar", "char '&' is not expected.", getLineNumberForPosition(xmlData, i));
              i = afterAmp;
            } else {
              if (reachedRoot === true && !isWhiteSpace(xmlData[i])) {
                return getErrorObject("InvalidXml", "Extra text at the end", getLineNumberForPosition(xmlData, i));
              }
            }
          }
          if (xmlData[i] === "<") {
            i--;
          }
        }
      } else {
        if (isWhiteSpace(xmlData[i])) {
          continue;
        }
        return getErrorObject("InvalidChar", "char '" + xmlData[i] + "' is not expected.", getLineNumberForPosition(xmlData, i));
      }
    }
    if (!tagFound) {
      return getErrorObject("InvalidXml", "Start tag expected.", 1);
    } else if (tags.length == 1) {
      return getErrorObject("InvalidTag", "Unclosed tag '" + tags[0].tagName + "'.", getLineNumberForPosition(xmlData, tags[0].tagStartPos));
    } else if (tags.length > 0) {
      return getErrorObject("InvalidXml", "Invalid '" + JSON.stringify(tags.map((t) => t.tagName), null, 4).replace(/\r?\n/g, "") + "' found.", { line: 1, col: 1 });
    }
    return true;
  }
  function isWhiteSpace(char) {
    return char === " " || char === "	" || char === "\n" || char === "\r";
  }
  function readPI(xmlData, i) {
    const start = i;
    for (; i < xmlData.length; i++) {
      if (xmlData[i] == "?" || xmlData[i] == " ") {
        const tagname = xmlData.substr(start, i - start);
        if (i > 5 && tagname === "xml") {
          return getErrorObject("InvalidXml", "XML declaration allowed only at the start of the document.", getLineNumberForPosition(xmlData, i));
        } else if (xmlData[i] == "?" && xmlData[i + 1] == ">") {
          i++;
          break;
        } else {
          continue;
        }
      }
    }
    return i;
  }
  function readCommentAndCDATA(xmlData, i) {
    if (xmlData.length > i + 5 && xmlData[i + 1] === "-" && xmlData[i + 2] === "-") {
      for (i += 3; i < xmlData.length; i++) {
        if (xmlData[i] === "-" && xmlData[i + 1] === "-" && xmlData[i + 2] === ">") {
          i += 2;
          break;
        }
      }
    } else if (xmlData.length > i + 8 && xmlData[i + 1] === "D" && xmlData[i + 2] === "O" && xmlData[i + 3] === "C" && xmlData[i + 4] === "T" && xmlData[i + 5] === "Y" && xmlData[i + 6] === "P" && xmlData[i + 7] === "E") {
      let angleBracketsCount = 1;
      for (i += 8; i < xmlData.length; i++) {
        if (xmlData[i] === "<") {
          angleBracketsCount++;
        } else if (xmlData[i] === ">") {
          angleBracketsCount--;
          if (angleBracketsCount === 0) {
            break;
          }
        }
      }
    } else if (xmlData.length > i + 9 && xmlData[i + 1] === "[" && xmlData[i + 2] === "C" && xmlData[i + 3] === "D" && xmlData[i + 4] === "A" && xmlData[i + 5] === "T" && xmlData[i + 6] === "A" && xmlData[i + 7] === "[") {
      for (i += 8; i < xmlData.length; i++) {
        if (xmlData[i] === "]" && xmlData[i + 1] === "]" && xmlData[i + 2] === ">") {
          i += 2;
          break;
        }
      }
    }
    return i;
  }
  var doubleQuote = '"';
  var singleQuote = "'";
  function readAttributeStr(xmlData, i) {
    let attrStr = "";
    let startChar = "";
    let tagClosed = false;
    for (; i < xmlData.length; i++) {
      if (xmlData[i] === doubleQuote || xmlData[i] === singleQuote) {
        if (startChar === "") {
          startChar = xmlData[i];
        } else if (startChar !== xmlData[i]) {
        } else {
          startChar = "";
        }
      } else if (xmlData[i] === ">") {
        if (startChar === "") {
          tagClosed = true;
          break;
        }
      }
      attrStr += xmlData[i];
    }
    if (startChar !== "") {
      return false;
    }
    return {
      value: attrStr,
      index: i,
      tagClosed
    };
  }
  function scanAttributeTokens(attrStr) {
    const tokens = [];
    const len = attrStr.length;
    let i = 0;
    while (i < len) {
      const tokenStart = i;
      while (i < len && isWhiteSpace(attrStr[i])) i++;
      if (i >= len) break;
      if (attrStr[i] === "=") {
        i = tokenStart + 1;
        continue;
      }
      const leadingWs = attrStr.slice(tokenStart, i);
      const nameStart = i;
      while (i < len && !isWhiteSpace(attrStr[i]) && attrStr[i] !== "=") i++;
      const name = attrStr.slice(nameStart, i);
      let equalsGroup;
      let j = i;
      while (j < len && isWhiteSpace(attrStr[j])) j++;
      if (j < len && attrStr[j] === "=") {
        equalsGroup = attrStr.slice(i, j + 1);
        i = j + 1;
      }
      let quoteChar;
      let value;
      let k = i;
      while (k < len && isWhiteSpace(attrStr[k])) k++;
      if (k < len && (attrStr[k] === '"' || attrStr[k] === "'")) {
        const valueStart = k + 1;
        const closeIdx = attrStr.indexOf(attrStr[k], valueStart);
        if (closeIdx !== -1) {
          quoteChar = attrStr[k];
          value = attrStr.slice(valueStart, closeIdx);
          i = closeIdx + 1;
        }
      }
      const token = { startIndex: tokenStart };
      token[1] = leadingWs;
      token[2] = name;
      token[3] = equalsGroup;
      token[4] = quoteChar !== void 0 ? true : void 0;
      token[5] = quoteChar;
      token[6] = value;
      tokens.push(token);
    }
    return tokens;
  }
  function validateAttributeString(attrStr, options) {
    const matches = scanAttributeTokens(attrStr);
    const attrNames = {};
    for (let i = 0; i < matches.length; i++) {
      if (matches[i][1].length === 0) {
        return getErrorObject("InvalidAttr", "Attribute '" + matches[i][2] + "' has no space in starting.", getPositionFromMatch(matches[i]));
      } else if (matches[i][3] !== void 0 && matches[i][4] === void 0) {
        return getErrorObject("InvalidAttr", "Attribute '" + matches[i][2] + "' is without value.", getPositionFromMatch(matches[i]));
      } else if (matches[i][3] === void 0 && !options.allowBooleanAttributes) {
        return getErrorObject("InvalidAttr", "boolean attribute '" + matches[i][2] + "' is not allowed.", getPositionFromMatch(matches[i]));
      }
      const attrName = matches[i][2];
      if (!validateAttrName(attrName)) {
        return getErrorObject("InvalidAttr", "Attribute '" + attrName + "' is an invalid name.", getPositionFromMatch(matches[i]));
      }
      if (!Object.prototype.hasOwnProperty.call(attrNames, attrName)) {
        attrNames[attrName] = 1;
      } else {
        return getErrorObject("InvalidAttr", "Attribute '" + attrName + "' is repeated.", getPositionFromMatch(matches[i]));
      }
    }
    return true;
  }
  function validateNumberAmpersand(xmlData, i) {
    let re = /\d/;
    if (xmlData[i] === "x") {
      i++;
      re = /[\da-fA-F]/;
    }
    for (; i < xmlData.length; i++) {
      if (xmlData[i] === ";")
        return i;
      if (!xmlData[i].match(re))
        break;
    }
    return -1;
  }
  function validateAmpersand(xmlData, i) {
    i++;
    if (xmlData[i] === ";")
      return -1;
    if (xmlData[i] === "#") {
      i++;
      return validateNumberAmpersand(xmlData, i);
    }
    let count = 0;
    for (; i < xmlData.length; i++, count++) {
      if (xmlData[i].match(/\w/) && count < 20)
        continue;
      if (xmlData[i] === ";")
        break;
      return -1;
    }
    return i;
  }
  function getErrorObject(code, message, lineNumber) {
    return {
      err: {
        code,
        msg: message,
        line: lineNumber.line || lineNumber,
        col: lineNumber.col
      }
    };
  }
  function validateAttrName(attrName) {
    return isName(attrName);
  }
  function validateTagName(tagname) {
    return isName(tagname);
  }
  function getLineNumberForPosition(xmlData, index) {
    const lines = xmlData.substring(0, index).split(/\r?\n/);
    return {
      line: lines.length,
      // column number is last line's length + 1, because column numbering starts at 1:
      col: lines[lines.length - 1].length + 1
    };
  }
  function getPositionFromMatch(match) {
    return match.startIndex + match[1].length;
  }

  // node_modules/@nodable/entities/src/entities.js
  var CURRENCY = {
    cent: "\xA2",
    pound: "\xA3",
    curren: "\xA4",
    yen: "\xA5",
    euro: "\u20AC",
    dollar: "$",
    fnof: "\u0192",
    inr: "\u20B9",
    af: "\u060B",
    birr: "\u1265\u122D",
    peso: "\u20B1",
    rub: "\u20BD",
    won: "\u20A9",
    yuan: "\xA5",
    cedil: "\xB8"
  };
  var XML = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"'
  };
  var COMMON_HTML = {
    nbsp: "\xA0",
    copy: "\xA9",
    reg: "\xAE",
    trade: "\u2122",
    mdash: "\u2014",
    ndash: "\u2013",
    hellip: "\u2026",
    laquo: "\xAB",
    raquo: "\xBB",
    lsquo: "\u2018",
    rsquo: "\u2019",
    ldquo: "\u201C",
    rdquo: "\u201D",
    bull: "\u2022",
    para: "\xB6",
    sect: "\xA7",
    deg: "\xB0",
    frac12: "\xBD",
    frac14: "\xBC",
    frac34: "\xBE"
  };

  // node_modules/@nodable/entities/src/EntityDecoder.js
  var ENTITY_ACTION = Object.freeze({
    /** Resolve and expand the entity normally. */
    ALLOW: "allow",
    /** Silently skip this entity — it will not be registered. */
    BLOCK: "block",
    /** Throw an error, aborting entity registration entirely. */
    THROW: "throw"
  });
  var SPECIAL_CHARS = new Set("!?\\\\/[]$%{}^&*()<>|+");
  function validateEntityName(name) {
    if (name[0] === "#") {
      throw new Error(`[EntityReplacer] Invalid character '#' in entity name: "${name}"`);
    }
    for (const ch of name) {
      if (SPECIAL_CHARS.has(ch)) {
        throw new Error(`[EntityReplacer] Invalid character '${ch}' in entity name: "${name}"`);
      }
    }
    return name;
  }
  function mergeEntityMaps(...maps) {
    const out = /* @__PURE__ */ Object.create(null);
    for (const map of maps) {
      if (!map) continue;
      for (const key of Object.keys(map)) {
        const raw = map[key];
        if (typeof raw === "string") {
          out[key] = raw;
        } else if (raw && typeof raw === "object" && raw.val !== void 0) {
          const val = raw.val;
          if (typeof val === "string") {
            out[key] = val;
          }
        }
      }
    }
    return out;
  }
  var LIMIT_TIER_EXTERNAL = "external";
  var LIMIT_TIER_BASE = "base";
  var LIMIT_TIER_ALL = "all";
  function parseLimitTiers(raw) {
    if (!raw || raw === LIMIT_TIER_EXTERNAL) return /* @__PURE__ */ new Set([LIMIT_TIER_EXTERNAL]);
    if (raw === LIMIT_TIER_ALL) return /* @__PURE__ */ new Set([LIMIT_TIER_ALL]);
    if (raw === LIMIT_TIER_BASE) return /* @__PURE__ */ new Set([LIMIT_TIER_BASE]);
    if (Array.isArray(raw)) return new Set(raw);
    return /* @__PURE__ */ new Set([LIMIT_TIER_EXTERNAL]);
  }
  var NCR_LEVEL = Object.freeze({ allow: 0, leave: 1, remove: 2, throw: 3 });
  var XML10_ALLOWED_C0 = /* @__PURE__ */ new Set([9, 10, 13]);
  function parseNCRConfig(ncr) {
    if (!ncr) {
      return { xmlVersion: 1, onLevel: NCR_LEVEL.allow, nullLevel: NCR_LEVEL.remove };
    }
    const xmlVersion = ncr.xmlVersion === 1.1 ? 1.1 : 1;
    const onLevel = NCR_LEVEL[ncr.onNCR] ?? NCR_LEVEL.allow;
    const nullLevel = NCR_LEVEL[ncr.nullNCR] ?? NCR_LEVEL.remove;
    const clampedNull = Math.max(nullLevel, NCR_LEVEL.remove);
    return { xmlVersion, onLevel, nullLevel: clampedNull };
  }
  var EntityDecoder = class {
    /**
     * @param {object} [options]
     * @param {object|null}  [options.namedEntities]        — extra named entities merged into base map
     * @param {object}  [options.limit]                 — security limits
     * @param {number}       [options.limit.maxTotalExpansions=0]  — 0 = unlimited
     * @param {number}       [options.limit.maxExpandedLength=0]   — 0 = unlimited
     * @param {'external'|'base'|'all'|string[]} [options.limit.applyLimitsTo='external']
     *   Which entity tiers count against the security limits:
     *   - 'external' (default) — only input/runtime + persistent external entities
     *   - 'base'               — only DEFAULT_XML_ENTITIES + namedEntities
     *   - 'all'                — every entity regardless of tier
     *   - string[]             — explicit combination, e.g. ['external', 'base']
     * @param {((resolved: string, original: string) => string)|null} [options.postCheck=null]
     * @param {string[]} [options.remove=[]] — entity names (e.g. ['nbsp', '#13']) to delete (replace with empty string)
     * @param {string[]} [options.leave=[]]  — entity names to keep as literal (unchanged in output)
     * @param {object}   [options.ncr]       — Numeric Character Reference controls
     * @param {1.0|1.1}  [options.ncr.xmlVersion=1.0]
     *   XML version governing which codepoint ranges are restricted:
     *   - 1.0 — C0 controls U+0001–U+001F (except U+0009/000A/000D) are prohibited
     *   - 1.1 — C0 controls are allowed when written as NCRs; C1 (U+007F–U+009F) decoded as-is
     * @param {'allow'|'leave'|'remove'|'throw'} [options.ncr.onNCR='allow']
     *   Base action for numeric references. Severity order: allow < leave < remove < throw.
     *   For codepoint ranges that carry a minimum level (surrogates → remove, XML 1.0 C0 → remove),
     *   the effective action is max(onNCR, rangeMinimum).
     * @param {'remove'|'throw'} [options.ncr.nullNCR='remove']
     *   Action for U+0000 (null). 'allow' and 'leave' are clamped to 'remove' since null is never safe.
     * @param {((name: string, value: string) => 'allow'|'block'|'throw')|null} [options.onExternalEntity=null]
     *   Hook called when an external entity is registered via `setExternalEntities()` or
     *   `addExternalEntity()`. Return `ENTITY_ACTION.ALLOW` to accept the entity,
     *   `ENTITY_ACTION.BLOCK` to silently skip it, or `ENTITY_ACTION.THROW` to abort with an error.
     * @param {((name: string, value: string) => 'allow'|'block'|'throw')|null} [options.onInputEntity=null]
     *   Hook called when an input entity is registered via `addInputEntities()`. Return
     *   `ENTITY_ACTION.ALLOW` to accept, `ENTITY_ACTION.BLOCK` to silently skip, or
     *   `ENTITY_ACTION.THROW` to abort with an error.
     */
    constructor(options = {}) {
      this._limit = options.limit || {};
      this._maxTotalExpansions = this._limit.maxTotalExpansions || 0;
      this._maxExpandedLength = this._limit.maxExpandedLength || 0;
      this._postCheck = typeof options.postCheck === "function" ? options.postCheck : (r) => r;
      this._limitTiers = parseLimitTiers(this._limit.applyLimitsTo ?? LIMIT_TIER_EXTERNAL);
      this._numericAllowed = options.numericAllowed ?? true;
      this._baseMap = mergeEntityMaps(XML, options.namedEntities || null);
      this._externalMap = /* @__PURE__ */ Object.create(null);
      this._inputMap = /* @__PURE__ */ Object.create(null);
      this._totalExpansions = 0;
      this._expandedLength = 0;
      this._removeSet = new Set(options.remove && Array.isArray(options.remove) ? options.remove : []);
      this._leaveSet = new Set(options.leave && Array.isArray(options.leave) ? options.leave : []);
      const ncrCfg = parseNCRConfig(options.ncr);
      this._ncrXmlVersion = ncrCfg.xmlVersion;
      this._ncrOnLevel = ncrCfg.onLevel;
      this._ncrNullLevel = ncrCfg.nullLevel;
      this._onExternalEntity = typeof options.onExternalEntity === "function" ? options.onExternalEntity : null;
      this._onInputEntity = typeof options.onInputEntity === "function" ? options.onInputEntity : null;
    }
    // -------------------------------------------------------------------------
    // Private: registration hook dispatch
    // -------------------------------------------------------------------------
    /**
     * Invoke a registration hook for a single entity name/value pair.
     * Returns true when the entity should be accepted, false when it should be
     * silently skipped (BLOCK), and throws when the hook returns THROW.
     *
     * @param {((name: string, value: string) => 'allow'|'block'|'throw')|null} hook
     * @param {string} name
     * @param {string} value
     * @param {string} context  — used in error messages ('external' | 'input')
     * @returns {boolean}  true = accept, false = skip
     */
    _applyRegistrationHook(hook, name, value, context) {
      if (!hook) return true;
      const action = hook(name, value);
      if (action === ENTITY_ACTION.BLOCK) return false;
      if (action === ENTITY_ACTION.THROW) {
        throw new Error(
          `[EntityDecoder] Registration of ${context} entity "&${name};" was rejected by hook`
        );
      }
      return true;
    }
    // -------------------------------------------------------------------------
    // Persistent external entity registration
    // -------------------------------------------------------------------------
    /**
     * Replace the full set of persistent external entities.
     * All keys are validated — throws on invalid characters.
     * If `onExternalEntity` is set, it is called once per entry; entries that
     * return `ENTITY_ACTION.BLOCK` are silently omitted, `ENTITY_ACTION.THROW`
     * aborts the whole call.
     * @param {Record<string, string | { regex?: RegExp, val: string }>} map
     */
    setExternalEntities(map) {
      if (map) {
        for (const key of Object.keys(map)) {
          validateEntityName(key);
        }
      }
      if (!this._onExternalEntity) {
        this._externalMap = mergeEntityMaps(map);
        return;
      }
      const flat = mergeEntityMaps(map);
      const filtered = /* @__PURE__ */ Object.create(null);
      for (const [name, value] of Object.entries(flat)) {
        if (this._applyRegistrationHook(this._onExternalEntity, name, value, "external")) {
          filtered[name] = value;
        }
      }
      this._externalMap = filtered;
    }
    /**
     * Add a single persistent external entity.
     * If `onExternalEntity` is set it is called before the entity is stored;
     * `ENTITY_ACTION.BLOCK` silently skips storage, `ENTITY_ACTION.THROW` raises.
     * @param {string} key
     * @param {string} value
     */
    addExternalEntity(key, value) {
      validateEntityName(key);
      if (typeof value === "string" && value.indexOf("&") === -1) {
        if (this._applyRegistrationHook(this._onExternalEntity, key, value, "external")) {
          this._externalMap[key] = value;
        }
      }
    }
    // -------------------------------------------------------------------------
    // Input / runtime entity registration (per document)
    // -------------------------------------------------------------------------
    /**
     * Inject DOCTYPE entities for the current document.
     * Also resets per-document expansion counters.
     * If `onInputEntity` is set it is called once per entry; entries returning
     * `ENTITY_ACTION.BLOCK` are silently omitted, `ENTITY_ACTION.THROW` aborts.
     * @param {Record<string, string | { regx?: RegExp, regex?: RegExp, val: string }>} map
     */
    addInputEntities(map) {
      this._totalExpansions = 0;
      this._expandedLength = 0;
      if (!this._onInputEntity) {
        this._inputMap = mergeEntityMaps(map);
        return;
      }
      const flat = mergeEntityMaps(map);
      const filtered = /* @__PURE__ */ Object.create(null);
      for (const [name, value] of Object.entries(flat)) {
        if (this._applyRegistrationHook(this._onInputEntity, name, value, "input")) {
          filtered[name] = value;
        }
      }
      this._inputMap = filtered;
    }
    // -------------------------------------------------------------------------
    // Per-document reset
    // -------------------------------------------------------------------------
    /**
     * Wipe input/runtime entities and reset counters.
     * Call this before processing each new document.
     * @returns {this}
     */
    reset() {
      this._inputMap = /* @__PURE__ */ Object.create(null);
      this._totalExpansions = 0;
      this._expandedLength = 0;
      return this;
    }
    // -------------------------------------------------------------------------
    // XML version (can be set after construction, e.g. once parser reads <?xml?>)
    // -------------------------------------------------------------------------
    /**
     * Update the XML version used for NCR classification.
     * Call this as soon as the document's `<?xml version="...">` declaration is parsed.
     * @param {1.0|1.1|number} version
     */
    setXmlVersion(version) {
      this._ncrXmlVersion = version === 1.1 ? 1.1 : 1;
    }
    // -------------------------------------------------------------------------
    // Primary API
    // -------------------------------------------------------------------------
    /**
     * Replace all entity references in `str` in a single pass.
     *
     * @param {string} str
     * @returns {string}
     */
    decode(str) {
      if (typeof str !== "string" || str.length === 0) return str;
      if (str.indexOf("&") === -1) return str;
      const original = str;
      const chunks = [];
      const len = str.length;
      let last = 0;
      let i = 0;
      const limitExpansions = this._maxTotalExpansions > 0;
      const limitLength = this._maxExpandedLength > 0;
      const checkLimits = limitExpansions || limitLength;
      while (i < len) {
        if (str.charCodeAt(i) !== 38) {
          i++;
          continue;
        }
        let j = i + 1;
        while (j < len && str.charCodeAt(j) !== 59 && j - i <= 32) j++;
        if (j >= len || str.charCodeAt(j) !== 59) {
          i++;
          continue;
        }
        const token = str.slice(i + 1, j);
        if (token.length === 0) {
          i++;
          continue;
        }
        let replacement;
        let tier;
        if (this._removeSet.has(token)) {
          replacement = "";
          if (tier === void 0) {
            tier = LIMIT_TIER_EXTERNAL;
          }
        } else if (this._leaveSet.has(token)) {
          i++;
          continue;
        } else if (token.charCodeAt(0) === 35) {
          const ncrResult = this._resolveNCR(token);
          if (ncrResult === void 0) {
            i++;
            continue;
          }
          replacement = ncrResult;
          tier = LIMIT_TIER_BASE;
        } else {
          const resolved = this._resolveName(token);
          replacement = resolved?.value;
          tier = resolved?.tier;
        }
        if (replacement === void 0) {
          i++;
          continue;
        }
        if (i > last) chunks.push(str.slice(last, i));
        chunks.push(replacement);
        last = j + 1;
        i = last;
        if (checkLimits && this._tierCounts(tier)) {
          if (limitExpansions) {
            this._totalExpansions++;
            if (this._totalExpansions > this._maxTotalExpansions) {
              throw new Error(
                `[EntityReplacer] Entity expansion count limit exceeded: ${this._totalExpansions} > ${this._maxTotalExpansions}`
              );
            }
          }
          if (limitLength) {
            const delta = replacement.length - (token.length + 2);
            if (delta > 0) {
              this._expandedLength += delta;
              if (this._expandedLength > this._maxExpandedLength) {
                throw new Error(
                  `[EntityReplacer] Expanded content length limit exceeded: ${this._expandedLength} > ${this._maxExpandedLength}`
                );
              }
            }
          }
        }
      }
      if (last < len) chunks.push(str.slice(last));
      const result = chunks.length === 0 ? str : chunks.join("");
      return this._postCheck(result, original);
    }
    // -------------------------------------------------------------------------
    // Private: limit tier check
    // -------------------------------------------------------------------------
    /**
     * Returns true if a resolved entity of the given tier should count
     * against the expansion/length limits.
     * @param {string} tier  — LIMIT_TIER_EXTERNAL | LIMIT_TIER_BASE
     * @returns {boolean}
     */
    _tierCounts(tier) {
      if (this._limitTiers.has(LIMIT_TIER_ALL)) return true;
      return this._limitTiers.has(tier);
    }
    // -------------------------------------------------------------------------
    // Private: entity resolution
    // -------------------------------------------------------------------------
    /**
     * Resolve a named entity token (without & and ;).
     * Priority: inputMap > externalMap > baseMap
     * Returns the resolved value tagged with its limit tier.
     *
     * @param {string} name
     * @returns {{ value: string, tier: string }|undefined}
     */
    _resolveName(name) {
      if (name in this._inputMap) return { value: this._inputMap[name], tier: LIMIT_TIER_EXTERNAL };
      if (name in this._externalMap) return { value: this._externalMap[name], tier: LIMIT_TIER_EXTERNAL };
      if (name in this._baseMap) return { value: this._baseMap[name], tier: LIMIT_TIER_BASE };
      return void 0;
    }
    /**
     * Classify a codepoint and return the minimum action level that must be applied.
     * Returns -1 when no minimum is imposed (normal allow path).
     *
     * Ranges checked (in priority order):
     *   1. U+0000            — null, governed by nullNCR (always ≥ remove)
     *   2. U+D800–U+DFFF     — surrogates, always prohibited (min: remove)
     *   3. U+0001–U+001F \ {0x09,0x0A,0x0D}  — XML 1.0 restricted C0 (min: remove)
     *      (skipped in XML 1.1 — C0 controls are allowed when written as NCRs)
     *
     * @param {number} cp  — codepoint
     * @returns {number}   — minimum NCR_LEVEL value, or -1 for no restriction
     */
    _classifyNCR(cp) {
      if (cp === 0) return this._ncrNullLevel;
      if (cp >= 55296 && cp <= 57343) return NCR_LEVEL.remove;
      if (this._ncrXmlVersion === 1) {
        if (cp >= 1 && cp <= 31 && !XML10_ALLOWED_C0.has(cp)) return NCR_LEVEL.remove;
      }
      return -1;
    }
    /**
     * Execute a resolved NCR action.
     *
     * @param {number} action   — NCR_LEVEL value
     * @param {string} token    — raw token (e.g. '#38') for error messages
     * @param {number} cp       — codepoint, used only for error messages
     * @returns {string|undefined}
     *   - decoded character string  → 'allow'
     *   - ''                        → 'remove'
     *   - undefined                 → 'leave' (caller must skip past '&' only)
     *   - throws Error              → 'throw'
     */
    _applyNCRAction(action, token, cp) {
      switch (action) {
        case NCR_LEVEL.allow:
          return String.fromCodePoint(cp);
        case NCR_LEVEL.remove:
          return "";
        case NCR_LEVEL.leave:
          return void 0;
        // signal: keep literal
        case NCR_LEVEL.throw:
          throw new Error(
            `[EntityDecoder] Prohibited numeric character reference &${token}; (U+${cp.toString(16).toUpperCase().padStart(4, "0")})`
          );
        default:
          return String.fromCodePoint(cp);
      }
    }
    /**
     * Full NCR resolution pipeline for a numeric token.
     *
     * Steps:
     *   1. Parse the codepoint (decimal or hex).
     *   2. Validate the raw codepoint range (NaN, <0, >0x10FFFF).
     *   3. If numericAllowed is false and no minimum restriction applies → leave as-is.
     *   4. Classify the codepoint to find the minimum required action level.
     *   5. Resolve effective action = max(onNCR, minimum).
     *   6. Apply and return.
     *
     * @param {string} token  — e.g. '#38', '#x26', '#X26'
     * @returns {string|undefined}
     *   - string (incl. '')  — replacement ('' = remove)
     *   - undefined          — leave original &token; as-is
     */
    _resolveNCR(token) {
      const second = token.charCodeAt(1);
      let cp;
      if (second === 120 || second === 88) {
        cp = parseInt(token.slice(2), 16);
      } else {
        cp = parseInt(token.slice(1), 10);
      }
      if (Number.isNaN(cp) || cp < 0 || cp > 1114111) return void 0;
      const minimum = this._classifyNCR(cp);
      if (!this._numericAllowed && minimum < NCR_LEVEL.remove) return void 0;
      const effective = minimum === -1 ? this._ncrOnLevel : Math.max(this._ncrOnLevel, minimum);
      return this._applyNCRAction(effective, token, cp);
    }
  };

  // node_modules/fast-xml-parser/src/xmlparser/OptionsBuilder.js
  var defaultOnDangerousProperty = (name) => {
    if (DANGEROUS_PROPERTY_NAMES.includes(name)) {
      return "__" + name;
    }
    return name;
  };
  var defaultOptions2 = {
    preserveOrder: false,
    attributeNamePrefix: "@_",
    attributesGroupName: false,
    textNodeName: "#text",
    ignoreAttributes: true,
    removeNSPrefix: false,
    // remove NS from tag name or attribute name if true
    allowBooleanAttributes: false,
    //a tag can have attributes without any value
    //ignoreRootElement : false,
    parseTagValue: true,
    parseAttributeValue: false,
    trimValues: true,
    //Trim string values of tag and attributes
    cdataPropName: false,
    numberParseOptions: {
      hex: true,
      leadingZeros: true,
      eNotation: true,
      unicode: false
    },
    tagValueProcessor: function(tagName, val) {
      return val;
    },
    attributeValueProcessor: function(attrName, val) {
      return val;
    },
    stopNodes: [],
    //nested tags will not be parsed even for errors
    alwaysCreateTextNode: false,
    isArray: () => false,
    commentPropName: false,
    unpairedTags: [],
    processEntities: true,
    htmlEntities: false,
    entityDecoder: null,
    ignoreDeclaration: false,
    ignorePiTags: false,
    transformTagName: false,
    transformAttributeName: false,
    updateTag: function(tagName, jPath, attrs) {
      return tagName;
    },
    // skipEmptyListItem: false
    captureMetaData: false,
    maxNestedTags: 100,
    strictReservedNames: true,
    jPath: true,
    // if true, pass jPath string to callbacks; if false, pass matcher instance
    onDangerousProperty: defaultOnDangerousProperty
  };
  function validatePropertyName(propertyName, optionName) {
    if (typeof propertyName !== "string") {
      return;
    }
    const normalized = propertyName.toLowerCase();
    if (DANGEROUS_PROPERTY_NAMES.some((dangerous) => normalized === dangerous.toLowerCase())) {
      throw new Error(
        `[SECURITY] Invalid ${optionName}: "${propertyName}" is a reserved JavaScript keyword that could cause prototype pollution`
      );
    }
    if (criticalProperties.some((dangerous) => normalized === dangerous.toLowerCase())) {
      throw new Error(
        `[SECURITY] Invalid ${optionName}: "${propertyName}" is a reserved JavaScript keyword that could cause prototype pollution`
      );
    }
  }
  function normalizeProcessEntities(value, htmlEntities) {
    if (typeof value === "boolean") {
      return {
        enabled: value,
        // true or false
        maxEntitySize: 1e4,
        maxExpansionDepth: 1e4,
        maxTotalExpansions: Infinity,
        maxExpandedLength: 1e5,
        maxEntityCount: 1e3,
        allowedTags: null,
        tagFilter: null,
        appliesTo: "all"
      };
    }
    if (typeof value === "object" && value !== null) {
      return {
        enabled: value.enabled !== false,
        maxEntitySize: Math.max(1, value.maxEntitySize ?? 1e4),
        maxExpansionDepth: Math.max(1, value.maxExpansionDepth ?? 1e4),
        maxTotalExpansions: Math.max(1, value.maxTotalExpansions ?? Infinity),
        maxExpandedLength: Math.max(1, value.maxExpandedLength ?? 1e5),
        maxEntityCount: Math.max(1, value.maxEntityCount ?? 1e3),
        allowedTags: value.allowedTags ?? null,
        tagFilter: value.tagFilter ?? null,
        appliesTo: value.appliesTo ?? "all"
      };
    }
    return normalizeProcessEntities(true);
  }
  var buildOptions = function(options) {
    const built = Object.assign({}, defaultOptions2, options);
    const propertyNameOptions = [
      { value: built.attributeNamePrefix, name: "attributeNamePrefix" },
      { value: built.attributesGroupName, name: "attributesGroupName" },
      { value: built.textNodeName, name: "textNodeName" },
      { value: built.cdataPropName, name: "cdataPropName" },
      { value: built.commentPropName, name: "commentPropName" }
    ];
    for (const { value, name } of propertyNameOptions) {
      if (value) {
        validatePropertyName(value, name);
      }
    }
    if (built.onDangerousProperty === null) {
      built.onDangerousProperty = defaultOnDangerousProperty;
    }
    built.processEntities = normalizeProcessEntities(built.processEntities, built.htmlEntities);
    built.unpairedTagsSet = new Set(built.unpairedTags);
    if (built.stopNodes && Array.isArray(built.stopNodes)) {
      built.stopNodes = built.stopNodes.map((node) => {
        if (typeof node === "string" && node.startsWith("*.")) {
          return ".." + node.substring(2);
        }
        return node;
      });
    }
    return built;
  };

  // node_modules/fast-xml-parser/src/xmlparser/xmlNode.js
  var METADATA_SYMBOL;
  if (typeof Symbol !== "function") {
    METADATA_SYMBOL = "@@xmlMetadata";
  } else {
    METADATA_SYMBOL = Symbol("XML Node Metadata");
  }
  var XmlNode = class {
    constructor(tagname) {
      this.tagname = tagname;
      this.child = [];
      this[":@"] = /* @__PURE__ */ Object.create(null);
    }
    add(key, val) {
      if (key === "__proto__") key = "#__proto__";
      this.child.push({ [key]: val });
    }
    addChild(node, startIndex) {
      if (node.tagname === "__proto__") node.tagname = "#__proto__";
      if (node[":@"] && Object.keys(node[":@"]).length > 0) {
        this.child.push({ [node.tagname]: node.child, [":@"]: node[":@"] });
      } else {
        this.child.push({ [node.tagname]: node.child });
      }
      this.addStartIndex(startIndex);
    }
    addStartIndex(startIndex) {
      if (startIndex !== void 0) {
        this.child[this.child.length - 1][METADATA_SYMBOL] = { startIndex };
      }
    }
    addEndIndex(endIndex) {
      const lastChild = this.child[this.child.length - 1];
      if (lastChild !== void 0 && lastChild[METADATA_SYMBOL] !== void 0 && lastChild[METADATA_SYMBOL].endIndex === void 0) {
        lastChild[METADATA_SYMBOL].endIndex = endIndex;
      }
    }
    /** symbol used for metadata */
    static getMetaDataSymbol() {
      return METADATA_SYMBOL;
    }
  };

  // node_modules/xml-naming/src/index.js
  var nameStartChar10 = ":A-Za-z_\xC0-\xD6\xD8-\xF6\xF8-\u02FF\u0370-\u037D\u037F-\u0486\u0488-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD";
  var nameChar10 = nameStartChar10 + "\\-\\.\\d\xB7\u0300-\u036F\u203F-\u2040";
  var nameStartChar11 = ":A-Za-z_\xC0-\u02FF\u0370-\u037D\u037F-\u0486\u0488-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u{10000}-\u{EFFFF}";
  var nameChar11 = nameStartChar11 + "\\-\\.\\d\xB7\u0300-\u036F\u0487\u203F-\u2040";
  var buildRegexes = (startChar, char, flags = "") => {
    const ncStart = startChar.replace(":", "");
    const ncChar = char.replace(":", "");
    const ncNamePat = `[${ncStart}][${ncChar}]*`;
    return {
      name: new RegExp(`^[${startChar}][${char}]*$`, flags),
      ncName: new RegExp(`^${ncNamePat}$`, flags),
      qName: new RegExp(`^${ncNamePat}(?::${ncNamePat})?$`, flags),
      nmToken: new RegExp(`^[${char}]+$`, flags),
      nmTokens: new RegExp(`^[${char}]+(?:\\s+[${char}]+)*$`, flags)
    };
  };
  var regexes10 = buildRegexes(nameStartChar10, nameChar10);
  var regexes11 = buildRegexes(nameStartChar11, nameChar11, "u");
  var nameStartCharAscii = ":A-Za-z_";
  var nameCharAscii = nameStartCharAscii + "\\-\\.\\d";
  var regexesAscii = buildRegexes(nameStartCharAscii, nameCharAscii);
  var getRegexes = (xmlVersion = "1.0", asciiOnly = false) => {
    if (asciiOnly) return regexesAscii;
    return xmlVersion === "1.1" ? regexes11 : regexes10;
  };
  var qName = (str, { xmlVersion = "1.0", asciiOnly = false } = {}) => getRegexes(xmlVersion, asciiOnly).qName.test(str);

  // node_modules/fast-xml-parser/src/xmlparser/DocTypeReader.js
  var DocTypeReader = class {
    constructor(options, xmlVersion) {
      this.suppressValidationErr = !options;
      this.options = options;
      this.xmlVersion = xmlVersion || 1;
    }
    setXmlVersion(xmlVersion = 1) {
      this.xmlVersion = xmlVersion;
    }
    readDocType(xmlData, i) {
      const entities = /* @__PURE__ */ Object.create(null);
      let entityCount = 0;
      if (xmlData[i + 3] === "O" && xmlData[i + 4] === "C" && xmlData[i + 5] === "T" && xmlData[i + 6] === "Y" && xmlData[i + 7] === "P" && xmlData[i + 8] === "E") {
        i = i + 9;
        let angleBracketsCount = 1;
        let hasBody = false, comment = false;
        let quoteChar = null;
        let exp = "";
        for (; i < xmlData.length; i++) {
          if (quoteChar !== null) {
            if (xmlData[i] === quoteChar) quoteChar = null;
            exp += xmlData[i];
            continue;
          }
          if (!hasBody && !comment && (xmlData[i] === '"' || xmlData[i] === "'")) {
            quoteChar = xmlData[i];
            exp += xmlData[i];
            continue;
          }
          if (xmlData[i] === "<" && !comment) {
            if (hasBody && hasSeq(xmlData, "!ENTITY", i)) {
              i += 7;
              let entityName, val;
              [entityName, val, i] = this.readEntityExp(xmlData, i + 1, this.suppressValidationErr);
              if (val.indexOf("&") === -1) {
                if (this.options.enabled !== false && this.options.maxEntityCount != null && entityCount >= this.options.maxEntityCount) {
                  throw new Error(
                    `Entity count (${entityCount + 1}) exceeds maximum allowed (${this.options.maxEntityCount})`
                  );
                }
                entities[entityName] = val;
                entityCount++;
              }
            } else if (hasBody && hasSeq(xmlData, "!ELEMENT", i)) {
              i += 8;
              const { index } = this.readElementExp(xmlData, i + 1);
              i = index;
            } else if (hasBody && hasSeq(xmlData, "!ATTLIST", i)) {
              i += 8;
            } else if (hasBody && hasSeq(xmlData, "!NOTATION", i)) {
              i += 9;
              const { index } = this.readNotationExp(xmlData, i + 1, this.suppressValidationErr);
              i = index;
            } else if (hasSeq(xmlData, "!--", i)) comment = true;
            else throw new Error(`Invalid DOCTYPE`);
            angleBracketsCount++;
            exp = "";
          } else if (xmlData[i] === ">") {
            if (comment) {
              if (xmlData[i - 1] === "-" && xmlData[i - 2] === "-") {
                comment = false;
                angleBracketsCount--;
              }
            } else {
              angleBracketsCount--;
            }
            if (angleBracketsCount === 0) {
              break;
            }
          } else if (xmlData[i] === "[") {
            hasBody = true;
          } else {
            exp += xmlData[i];
          }
        }
        if (quoteChar !== null || angleBracketsCount !== 0) {
          throw new Error(`Unclosed DOCTYPE`);
        }
      } else {
        throw new Error(`Invalid Tag instead of DOCTYPE`);
      }
      return { entities, i };
    }
    readEntityExp(xmlData, i) {
      i = skipWhitespace(xmlData, i);
      const startIndex = i;
      while (i < xmlData.length && !/\s/.test(xmlData[i]) && xmlData[i] !== '"' && xmlData[i] !== "'") {
        i++;
      }
      let entityName = xmlData.substring(startIndex, i);
      validateEntityName2(entityName, { xmlVersion: this.xmlVersion });
      i = skipWhitespace(xmlData, i);
      if (!this.suppressValidationErr) {
        if (xmlData.substring(i, i + 6).toUpperCase() === "SYSTEM") {
          throw new Error("External entities are not supported");
        } else if (xmlData[i] === "%") {
          throw new Error("Parameter entities are not supported");
        }
      }
      let entityValue = "";
      [i, entityValue] = this.readIdentifierVal(xmlData, i, "entity");
      if (this.options.enabled !== false && this.options.maxEntitySize != null && entityValue.length > this.options.maxEntitySize) {
        throw new Error(
          `Entity "${entityName}" size (${entityValue.length}) exceeds maximum allowed size (${this.options.maxEntitySize})`
        );
      }
      i--;
      return [entityName, entityValue, i];
    }
    readNotationExp(xmlData, i) {
      i = skipWhitespace(xmlData, i);
      const startIndex = i;
      while (i < xmlData.length && !/\s/.test(xmlData[i])) {
        i++;
      }
      let notationName = xmlData.substring(startIndex, i);
      !this.suppressValidationErr && validateEntityName2(notationName, { xmlVersion: this.xmlVersion });
      i = skipWhitespace(xmlData, i);
      const identifierType = xmlData.substring(i, i + 6).toUpperCase();
      if (!this.suppressValidationErr && identifierType !== "SYSTEM" && identifierType !== "PUBLIC") {
        throw new Error(`Expected SYSTEM or PUBLIC, found "${identifierType}"`);
      }
      i += identifierType.length;
      i = skipWhitespace(xmlData, i);
      let publicIdentifier = null;
      let systemIdentifier = null;
      if (identifierType === "PUBLIC") {
        [i, publicIdentifier] = this.readIdentifierVal(xmlData, i, "publicIdentifier");
        i = skipWhitespace(xmlData, i);
        if (xmlData[i] === '"' || xmlData[i] === "'") {
          [i, systemIdentifier] = this.readIdentifierVal(xmlData, i, "systemIdentifier");
        }
      } else if (identifierType === "SYSTEM") {
        [i, systemIdentifier] = this.readIdentifierVal(xmlData, i, "systemIdentifier");
        if (!this.suppressValidationErr && !systemIdentifier) {
          throw new Error("Missing mandatory system identifier for SYSTEM notation");
        }
      }
      return { notationName, publicIdentifier, systemIdentifier, index: --i };
    }
    readIdentifierVal(xmlData, i, type) {
      let identifierVal = "";
      const startChar = xmlData[i];
      if (startChar !== '"' && startChar !== "'") {
        throw new Error(`Expected quoted string, found "${startChar}"`);
      }
      i++;
      const startIndex = i;
      while (i < xmlData.length && xmlData[i] !== startChar) {
        i++;
      }
      identifierVal = xmlData.substring(startIndex, i);
      if (xmlData[i] !== startChar) {
        throw new Error(`Unterminated ${type} value`);
      }
      i++;
      return [i, identifierVal];
    }
    readElementExp(xmlData, i) {
      i = skipWhitespace(xmlData, i);
      const startIndex = i;
      while (i < xmlData.length && !/\s/.test(xmlData[i])) {
        i++;
      }
      let elementName = xmlData.substring(startIndex, i);
      if (!this.suppressValidationErr && !qName(elementName, { xmlVersion: this.xmlVersion })) {
        throw new Error(`Invalid element name: "${elementName}"`);
      }
      i = skipWhitespace(xmlData, i);
      let contentModel = "";
      if (xmlData[i] === "E" && hasSeq(xmlData, "MPTY", i)) i += 4;
      else if (xmlData[i] === "A" && hasSeq(xmlData, "NY", i)) i += 2;
      else if (xmlData[i] === "(") {
        i++;
        const startIndex2 = i;
        while (i < xmlData.length && xmlData[i] !== ")") {
          i++;
        }
        contentModel = xmlData.substring(startIndex2, i);
        if (xmlData[i] !== ")") {
          throw new Error("Unterminated content model");
        }
      } else if (!this.suppressValidationErr) {
        throw new Error(`Invalid Element Expression, found "${xmlData[i]}"`);
      }
      return {
        elementName,
        contentModel: contentModel.trim(),
        index: i
      };
    }
    readAttlistExp(xmlData, i) {
      i = skipWhitespace(xmlData, i);
      let startIndex = i;
      while (i < xmlData.length && !/\s/.test(xmlData[i])) {
        i++;
      }
      let elementName = xmlData.substring(startIndex, i);
      validateEntityName2(elementName, { xmlVersion: this.xmlVersion });
      i = skipWhitespace(xmlData, i);
      startIndex = i;
      while (i < xmlData.length && !/\s/.test(xmlData[i])) {
        i++;
      }
      let attributeName = xmlData.substring(startIndex, i);
      if (!validateEntityName2(attributeName, { xmlVersion: this.xmlVersion })) {
        throw new Error(`Invalid attribute name: "${attributeName}"`);
      }
      i = skipWhitespace(xmlData, i);
      let attributeType = "";
      if (xmlData.substring(i, i + 8).toUpperCase() === "NOTATION") {
        attributeType = "NOTATION";
        i += 8;
        i = skipWhitespace(xmlData, i);
        if (xmlData[i] !== "(") {
          throw new Error(`Expected '(', found "${xmlData[i]}"`);
        }
        i++;
        let allowedNotations = [];
        while (i < xmlData.length && xmlData[i] !== ")") {
          const startIndex2 = i;
          while (i < xmlData.length && xmlData[i] !== "|" && xmlData[i] !== ")") {
            i++;
          }
          let notation = xmlData.substring(startIndex2, i);
          notation = notation.trim();
          if (!validateEntityName2(notation, { xmlVersion: this.xmlVersion })) {
            throw new Error(`Invalid notation name: "${notation}"`);
          }
          allowedNotations.push(notation);
          if (xmlData[i] === "|") {
            i++;
            i = skipWhitespace(xmlData, i);
          }
        }
        if (xmlData[i] !== ")") {
          throw new Error("Unterminated list of notations");
        }
        i++;
        attributeType += " (" + allowedNotations.join("|") + ")";
      } else {
        const startIndex2 = i;
        while (i < xmlData.length && !/\s/.test(xmlData[i])) {
          i++;
        }
        attributeType += xmlData.substring(startIndex2, i);
        const validTypes = ["CDATA", "ID", "IDREF", "IDREFS", "ENTITY", "ENTITIES", "NMTOKEN", "NMTOKENS"];
        if (!this.suppressValidationErr && !validTypes.includes(attributeType.toUpperCase())) {
          throw new Error(`Invalid attribute type: "${attributeType}"`);
        }
      }
      i = skipWhitespace(xmlData, i);
      let defaultValue = "";
      if (xmlData.substring(i, i + 8).toUpperCase() === "#REQUIRED") {
        defaultValue = "#REQUIRED";
        i += 8;
      } else if (xmlData.substring(i, i + 7).toUpperCase() === "#IMPLIED") {
        defaultValue = "#IMPLIED";
        i += 7;
      } else {
        [i, defaultValue] = this.readIdentifierVal(xmlData, i, "ATTLIST");
      }
      return {
        elementName,
        attributeName,
        attributeType,
        defaultValue,
        index: i
      };
    }
  };
  var skipWhitespace = (data, index) => {
    while (index < data.length && /\s/.test(data[index])) {
      index++;
    }
    return index;
  };
  function hasSeq(data, seq, i) {
    for (let j = 0; j < seq.length; j++) {
      if (seq[j] !== data[i + j + 1]) return false;
    }
    return true;
  }
  function validateEntityName2(name, xmlVersion) {
    if (qName(name, { xmlVersion }))
      return name;
    else
      throw new Error(`Invalid entity name ${name}`);
  }

  // node_modules/anynum/digitTable.js
  var SCRIPT_ZEROS = [
    // Basic Latin (ASCII) — included for completeness / pass-through
    48,
    // 0-9
    // Arabic scripts
    1632,
    // Arabic-Indic ٠١٢٣٤٥٦٧٨٩
    1776,
    // Extended Arabic-Indic (Urdu/Persian/Sindhi) ۰۱۲۳
    // Indic scripts
    2406,
    // Devanagari ०१२३४५६७८९
    2534,
    // Bengali ০১২৩৪৫৬৭৮৯
    2662,
    // Gurmukhi ੦੧੨੩੪੫੬੭੮੯
    2790,
    // Gujarati ૦૧૨૩૪૫૬૭૮૯
    2918,
    // Odia ୦୧୨୩୪୫୬୭୮୯
    3046,
    // Tamil ௦௧௨௩௪௫௬௭௮௯
    3174,
    // Telugu ౦౧౨౩౪౫౬౭౮౯
    3302,
    // Kannada ೦೧೨೩೪೫೬೭೮೯
    3430,
    // Malayalam ൦൧൨൩൪൫൬൭൮൯
    3558,
    // Sinhala Archaic ෦෧෨෩෪෫෬෭෮෯
    // Southeast Asian scripts
    3664,
    // Thai ๐๑๒๓๔๕๖๗๘๙
    3792,
    // Lao ໐໑໒໓໔໕໖໗໘໙
    3872,
    // Tibetan ༠༡༢༣༤༥༦༧༨༩
    4160,
    // Myanmar ၀၁၂၃၄၅၆၇၈၉
    4240,
    // Myanmar Shan ႐႑႒႓႔႕႖႗႘႙
    6112,
    // Khmer ០១២៣៤៥៦៧៨៩
    6160,
    // Mongolian ᠐᠑᠒᠓᠔᠕᠖᠗᠘᠙
    6470,
    // Limbu ᥆᥇᥈᥉᥊᥋᥌᥍᥎᥏
    6608,
    // New Tai Lue ᧐᧑᧒᧓᧔᧕᧖᧗᧘᧙
    6784,
    // Tai Tham Hora ᪀᪁᪂᪃᪄᪅᪆᪇᪈᪉
    6800,
    // Tai Tham Tham ᪐᪑᪒᪓᪔᪕᪖᪗᪘᪙
    6992,
    // Balinese ᭐᭑᭒᭓᭔᭕᭖᭗᭘᭙
    7088,
    // Sundanese ᮰᮱᮲᮳᮴᮵᮶᮷᮸᮹
    7232,
    // Lepcha ᱀᱁᱂᱃᱄᱅᱆᱇᱈᱉
    7248,
    // Ol Chiki ᱐᱑᱒᱓᱔᱕᱖᱗᱘᱙
    // Fullwidth (CJK context)
    65296,
    // Fullwidth ０１２３４５６７８９
    // Mathematical digit variants (Unicode math block)
    120782,
    // Mathematical Bold
    120792,
    // Mathematical Double-Struck
    120802,
    // Mathematical Sans-Serif
    120812,
    // Mathematical Sans-Serif Bold
    120822,
    // Mathematical Monospace
    // Other scripts
    66720,
    // Osmanya 𐒠𐒡𐒢𐒣𐒤𐒥𐒦𐒧𐒨𐒩
    68912,
    // Hanifi Rohingya 𐴰𐴱𐴲𐴳𐴴𐴵𐴶𐴷𐴸𐴹
    69734,
    // Brahmi 𑁦𑁧𑁨𑁩𑁪𑁫𑁬𑁭𑁮𑁯
    69872,
    // Sora Sompeng 𑃰𑃱𑃲𑃳𑃴𑃵𑃶𑃷𑃸𑃹
    69942,
    // Chakma 𑄶𑄷𑄸𑄹𑄺𑄻𑄼𑄽𑄾𑄿
    70096,
    // Sharada 𑇐𑇑𑇒𑇓𑇔𑇕𑇖𑇗𑇘𑇙
    70384,
    // Khudawadi 𑋰𑋱𑋲𑋳𑋴𑋵𑋶𑋷𑋸𑋹
    70736,
    // Newa 𑑐𑑑𑑒𑑓𑑔𑑕𑑖𑑗𑑘𑑙
    70864,
    // Tirhuta 𑓐𑓑𑓒𑓓𑓔𑓕𑓖𑓗𑓘𑓙
    71248,
    // Modi 𑙐𑙑𑙒𑙓𑙔𑙕𑙖𑙗𑙘𑙙
    71360,
    // Takri 𑛀𑛁𑛂𑛃𑛄𑛅𑛆𑛇𑛈𑛉
    71472,
    // Ahom 𑜰𑜱𑜲𑜳𑜴𑜵𑜶𑜷𑜸𑜹
    71904,
    // Warang Citi 𑣠𑣡𑣢𑣣𑣤𑣥𑣦𑣧𑣨𑣩
    72016,
    // Dives Akuru 𑥐𑥑𑥒𑥓𑥔𑥕𑥖𑥗𑥘𑥙
    72688,
    // Khitan Small Script 𑯰𑯱𑯲𑯳𑯴𑯵𑯶𑯷𑯸𑯹
    72784,
    // Bhaiksuki 𑱐𑱑𑱒𑱓𑱔𑱕𑱖𑱗𑱘𑱙
    73040,
    // Masaram Gondi 𑵐𑵑𑵒𑵓𑵔𑵕𑵖𑵗𑵘𑵙
    73120,
    // Gunjala Gondi 𑶠𑶡𑶢𑶣𑶤𑶥𑶦𑶧𑶨𑶩
    73552,
    // Kawi 𑽐𑽑𑽒𑽓𑽔𑽕𑽖𑽗𑽘𑽙
    92768,
    // Mro 𖩠𖩡𖩢𖩣𖩤𖩥𖩦𖩧𖩨𖩩
    92864,
    // Tangsa 𖫀𖫁𖫂𖫃𖫄𖫅𖫆𖫇𖫈𖫉
    93008,
    // Pahawh Hmong 𖭐𖭑𖭒𖭓𖭔𖭕𖭖𖭗𖭘𖭙
    123200,
    // Nyiakeng Puachue Hmong 𞅀𞅁𞅂𞅃𞅄𞅅𞅆𞅇𞅈𞅉
    123632,
    // Wancho 𞋰𞋱𞋲𞋳𞋴𞋵𞋶𞋷𞋸𞋹
    124144,
    // Nag Mundari 𞓰𞓱𞓲𞓳𞓴𞓵𞓶𞓷𞓸𞓹
    125264,
    // Adlam 𞥐𞥑𞥒𞥓𞥔𞥕𞥖𞥗𞥘𞥙
    130032
    // Segmented digit symbols 🯰🯱🯲🯳🯴🯵🯶🯷🯸🯹
  ];
  var NOT_DIGIT = 255;
  var HIGH_MAP = /* @__PURE__ */ new Map();
  var LOW_MAX = 65535;
  var LOW_MIN = 1632;
  var TABLE_OFFSET = LOW_MIN;
  var TABLE_SIZE = LOW_MAX - LOW_MIN + 1;
  var TABLE = new Uint8Array(TABLE_SIZE).fill(NOT_DIGIT);
  for (const zero of SCRIPT_ZEROS) {
    for (let d = 0; d < 10; d++) {
      const cp = zero + d;
      if (cp <= LOW_MAX) {
        TABLE[cp - TABLE_OFFSET] = d;
      } else {
        HIGH_MAP.set(cp, d);
      }
    }
  }

  // node_modules/anynum/anynum.js
  var CHAR_0 = 48;
  var CHAR_9 = 57;
  var CHAR_MINUS = 45;
  var MINUS_SET = /* @__PURE__ */ new Set([8722, 65293, 65123]);
  function anynum(str) {
    if (typeof str !== "string") return str;
    const len = str.length;
    if (len === 0) return str;
    let firstHit = -1;
    for (let i = 0; i < len; i++) {
      const cc = str.charCodeAt(i);
      if (cc >= CHAR_0 && cc <= CHAR_9 || cc === CHAR_MINUS) continue;
      if (cc < TABLE_OFFSET) {
        if (MINUS_SET.has(cc)) {
          firstHit = i;
          break;
        }
        continue;
      }
      if (cc >= 55296 && cc <= 56319) {
        if (i + 1 < len) {
          const low = str.charCodeAt(i + 1);
          if (low >= 56320 && low <= 57343) {
            const cp = 65536 + (cc - 55296 << 10) + (low - 56320);
            if (HIGH_MAP.has(cp)) {
              firstHit = i;
              break;
            }
          }
        }
        continue;
      }
      if (TABLE[cc - TABLE_OFFSET] !== NOT_DIGIT || MINUS_SET.has(cc)) {
        firstHit = i;
        break;
      }
    }
    if (firstHit === -1) return str;
    const chars = [];
    if (firstHit > 0) chars.push(str.slice(0, firstHit));
    for (let i = firstHit; i < len; i++) {
      const cc = str.charCodeAt(i);
      if (cc >= CHAR_0 && cc <= CHAR_9 || cc === CHAR_MINUS) {
        chars.push(str[i]);
        continue;
      }
      if (cc < TABLE_OFFSET) {
        chars.push(MINUS_SET.has(cc) ? "-" : str[i]);
        continue;
      }
      if (cc >= 55296 && cc <= 56319) {
        if (i + 1 < len) {
          const low = str.charCodeAt(i + 1);
          if (low >= 56320 && low <= 57343) {
            const cp = 65536 + (cc - 55296 << 10) + (low - 56320);
            const d2 = HIGH_MAP.get(cp);
            if (d2 !== void 0) {
              chars.push(String.fromCharCode(d2 + 48));
              i++;
              continue;
            }
          }
        }
        chars.push(str[i]);
        continue;
      }
      if (MINUS_SET.has(cc)) {
        chars.push("-");
        continue;
      }
      const d = TABLE[cc - TABLE_OFFSET];
      chars.push(d !== NOT_DIGIT ? String.fromCharCode(d + 48) : str[i]);
    }
    return chars.join("");
  }
  var anynum_default = anynum;

  // node_modules/strnum/strnum.js
  var hexRegex = /^[-+]?0x[a-fA-F0-9]+$/;
  var binRegex = /^0b[01]+$/;
  var octRegex = /^0o[0-7]+$/;
  var numRegex = /^([\-\+])?(0*)([0-9]*(\.[0-9]*)?)$/;
  var consider = {
    hex: true,
    binary: false,
    octal: false,
    leadingZeros: true,
    decimalPoint: ".",
    eNotation: true,
    //skipLike: /regex/,
    infinity: "original",
    // "null", "infinity" (Infinity type), "string" ("Infinity" (the string literal))
    unicode: false
  };
  function toNumber(str, options = {}) {
    options = Object.assign({}, consider, options);
    if (!str || typeof str !== "string") return str;
    let trimmedStr = str.trim();
    if (trimmedStr.length === 0) return str;
    else if (options.skipLike !== void 0 && options.skipLike.test(trimmedStr)) return str;
    else if (trimmedStr === "0") return 0;
    if (options.unicode) {
      trimmedStr = anynum_default(trimmedStr);
      if (trimmedStr === "0") return 0;
    }
    if (options.hex && hexRegex.test(trimmedStr)) {
      return parse_int(trimmedStr, 16);
    } else if (options.binary && binRegex.test(trimmedStr)) {
      return parse_int(trimmedStr, 2);
    } else if (options.octal && octRegex.test(trimmedStr)) {
      return parse_int(trimmedStr, 8);
    } else if (!isFinite(trimmedStr)) {
      return handleInfinity(str, Number(trimmedStr), options);
    } else if (trimmedStr.includes("e") || trimmedStr.includes("E")) {
      return resolveEnotation(str, trimmedStr, options);
    } else {
      const match = numRegex.exec(trimmedStr);
      if (match) {
        const sign = match[1] || "";
        const leadingZeros = match[2];
        let numTrimmedByZeros = trimZeros(match[3]);
        const decimalAdjacentToLeadingZeros = sign ? (
          // 0., -00., 000.
          str[leadingZeros.length + 1] === "."
        ) : str[leadingZeros.length] === ".";
        if (!options.leadingZeros && (leadingZeros.length > 1 || leadingZeros.length === 1 && !decimalAdjacentToLeadingZeros)) {
          return str;
        } else {
          const num = Number(trimmedStr);
          const parsedStr = String(num);
          if (num === 0) return num;
          if (parsedStr.search(/[eE]/) !== -1) {
            if (options.eNotation) return num;
            else return str;
          } else if (trimmedStr.indexOf(".") !== -1) {
            if (parsedStr === "0") return num;
            else if (parsedStr === numTrimmedByZeros) return num;
            else if (parsedStr === `${sign}${numTrimmedByZeros}`) return num;
            else return str;
          }
          let n = leadingZeros ? numTrimmedByZeros : trimmedStr;
          if (leadingZeros) {
            return n === parsedStr || sign + n === parsedStr ? num : str;
          } else {
            return n === parsedStr || n === sign + parsedStr ? num : str;
          }
        }
      } else {
        return str;
      }
    }
  }
  var eNotationRegx = /^([-+])?(0*)(\d*(\.\d*)?[eE][-\+]?\d+)$/;
  function resolveEnotation(str, trimmedStr, options) {
    if (!options.eNotation) return str;
    const notation = trimmedStr.match(eNotationRegx);
    if (notation) {
      let sign = notation[1] || "";
      const eChar = notation[3].indexOf("e") === -1 ? "E" : "e";
      const leadingZeros = notation[2];
      const eAdjacentToLeadingZeros = sign ? (
        // 0E.
        str[leadingZeros.length + 1] === eChar
      ) : str[leadingZeros.length] === eChar;
      if (leadingZeros.length > 1 && eAdjacentToLeadingZeros) return str;
      else if (leadingZeros.length === 1 && (notation[3].startsWith(`.${eChar}`) || notation[3][0] === eChar)) {
        return Number(trimmedStr);
      } else if (leadingZeros.length > 0) {
        if (options.leadingZeros && !eAdjacentToLeadingZeros) {
          trimmedStr = (notation[1] || "") + notation[3];
          return Number(trimmedStr);
        } else return str;
      } else {
        return Number(trimmedStr);
      }
    } else {
      return str;
    }
  }
  function trimZeros(numStr) {
    if (numStr && numStr.indexOf(".") !== -1) {
      let end = numStr.length;
      while (end > 0 && numStr.charCodeAt(end - 1) === 48) end--;
      numStr = numStr.slice(0, end);
      if (numStr === ".") numStr = "0";
      else if (numStr[0] === ".") numStr = "0" + numStr;
      else if (numStr[numStr.length - 1] === ".") numStr = numStr.substring(0, numStr.length - 1);
      return numStr;
    }
    return numStr;
  }
  function parse_int(numStr, base) {
    const str = numStr.trim();
    if (base === 2 || base === 8) numStr = str.substring(2);
    if (parseInt) return parseInt(numStr, base);
    else if (Number.parseInt) return Number.parseInt(numStr, base);
    else if (window && window.parseInt) return window.parseInt(numStr, base);
    else throw new Error("parseInt, Number.parseInt, window.parseInt are not supported");
  }
  function handleInfinity(str, num, options) {
    const isPositive = num === Infinity;
    switch (options.infinity.toLowerCase()) {
      case "null":
        return null;
      case "infinity":
        return num;
      // Return Infinity or -Infinity
      case "string":
        return isPositive ? "Infinity" : "-Infinity";
      case "original":
      default:
        return str;
    }
  }

  // node_modules/fast-xml-parser/src/ignoreAttributes.js
  function getIgnoreAttributesFn(ignoreAttributes) {
    if (typeof ignoreAttributes === "function") {
      return ignoreAttributes;
    }
    if (Array.isArray(ignoreAttributes)) {
      return (attrName) => {
        for (const pattern of ignoreAttributes) {
          if (typeof pattern === "string" && attrName === pattern) {
            return true;
          }
          if (pattern instanceof RegExp && pattern.test(attrName)) {
            return true;
          }
        }
      };
    }
    return () => false;
  }

  // node_modules/path-expression-matcher/src/Expression.js
  var Expression = class {
    /**
     * Create a new Expression
     * @param {string} pattern - Pattern string (e.g., "root.users.user", "..user[id]")
     * @param {Object} options - Configuration options
     * @param {string} options.separator - Path separator (default: '.')
     */
    constructor(pattern, options = {}, data) {
      this.pattern = pattern;
      this.separator = options.separator || ".";
      this.segments = this._parse(pattern);
      this.data = data;
      this._hasDeepWildcard = this.segments.some((seg) => seg.type === "deep-wildcard");
      this._hasAttributeCondition = this.segments.some((seg) => seg.attrName !== void 0);
      this._hasPositionSelector = this.segments.some((seg) => seg.position !== void 0);
    }
    /**
     * Parse pattern string into segments
     * @private
     * @param {string} pattern - Pattern to parse
     * @returns {Array} Array of segment objects
     */
    _parse(pattern) {
      const segments = [];
      let i = 0;
      let currentPart = "";
      while (i < pattern.length) {
        if (pattern[i] === this.separator) {
          if (i + 1 < pattern.length && pattern[i + 1] === this.separator) {
            if (currentPart.trim()) {
              segments.push(this._parseSegment(currentPart.trim()));
              currentPart = "";
            }
            segments.push({ type: "deep-wildcard" });
            i += 2;
          } else {
            if (currentPart.trim()) {
              segments.push(this._parseSegment(currentPart.trim()));
            }
            currentPart = "";
            i++;
          }
        } else {
          currentPart += pattern[i];
          i++;
        }
      }
      if (currentPart.trim()) {
        segments.push(this._parseSegment(currentPart.trim()));
      }
      return segments;
    }
    /**
     * Parse a single segment
     * @private
     * @param {string} part - Segment string (e.g., "user", "ns::user", "user[id]", "ns::user:first")
     * @returns {Object} Segment object
     */
    _parseSegment(part) {
      const segment = { type: "tag" };
      let bracketContent = null;
      let withoutBrackets = part;
      const bracketMatch = part.match(/^([^\[]+)(\[[^\]]*\])(.*)$/);
      if (bracketMatch) {
        withoutBrackets = bracketMatch[1] + bracketMatch[3];
        if (bracketMatch[2]) {
          const content = bracketMatch[2].slice(1, -1);
          if (content) {
            bracketContent = content;
          }
        }
      }
      let namespace = void 0;
      let tagAndPosition = withoutBrackets;
      if (withoutBrackets.includes("::")) {
        const nsIndex = withoutBrackets.indexOf("::");
        namespace = withoutBrackets.substring(0, nsIndex).trim();
        tagAndPosition = withoutBrackets.substring(nsIndex + 2).trim();
        if (!namespace) {
          throw new Error(`Invalid namespace in pattern: ${part}`);
        }
      }
      let tag = void 0;
      let positionMatch = null;
      if (tagAndPosition.includes(":")) {
        const colonIndex = tagAndPosition.lastIndexOf(":");
        const tagPart = tagAndPosition.substring(0, colonIndex).trim();
        const posPart = tagAndPosition.substring(colonIndex + 1).trim();
        const isPositionKeyword = ["first", "last", "odd", "even"].includes(posPart) || /^nth\(\d+\)$/.test(posPart);
        if (isPositionKeyword) {
          tag = tagPart;
          positionMatch = posPart;
        } else {
          tag = tagAndPosition;
        }
      } else {
        tag = tagAndPosition;
      }
      if (!tag) {
        throw new Error(`Invalid segment pattern: ${part}`);
      }
      segment.tag = tag;
      if (namespace) {
        segment.namespace = namespace;
      }
      if (bracketContent) {
        if (bracketContent.includes("=")) {
          const eqIndex = bracketContent.indexOf("=");
          segment.attrName = bracketContent.substring(0, eqIndex).trim();
          segment.attrValue = bracketContent.substring(eqIndex + 1).trim();
        } else {
          segment.attrName = bracketContent.trim();
        }
      }
      if (positionMatch) {
        const nthMatch = positionMatch.match(/^nth\((\d+)\)$/);
        if (nthMatch) {
          segment.position = "nth";
          segment.positionValue = parseInt(nthMatch[1], 10);
        } else {
          segment.position = positionMatch;
        }
      }
      return segment;
    }
    /**
     * Get the number of segments
     * @returns {number}
     */
    get length() {
      return this.segments.length;
    }
    /**
     * Check if expression contains deep wildcard
     * @returns {boolean}
     */
    hasDeepWildcard() {
      return this._hasDeepWildcard;
    }
    /**
     * Check if expression has attribute conditions
     * @returns {boolean}
     */
    hasAttributeCondition() {
      return this._hasAttributeCondition;
    }
    /**
     * Check if expression has position selectors
     * @returns {boolean}
     */
    hasPositionSelector() {
      return this._hasPositionSelector;
    }
    /**
     * Get string representation
     * @returns {string}
     */
    toString() {
      return this.pattern;
    }
  };

  // node_modules/path-expression-matcher/src/ExpressionSet.js
  var ExpressionSet = class {
    constructor() {
      this._byDepthAndTag = /* @__PURE__ */ new Map();
      this._wildcardByDepth = /* @__PURE__ */ new Map();
      this._deepWildcards = [];
      this._deepByTerminalTag = /* @__PURE__ */ new Map();
      this._patterns = /* @__PURE__ */ new Set();
      this._sealed = false;
    }
    /**
     * Add an Expression to the set.
     * Duplicate patterns (same pattern string) are silently ignored.
     *
     * @param {import('./Expression.js').default} expression - A pre-constructed Expression instance
     * @returns {this} for chaining
     * @throws {TypeError} if called after seal()
     *
     * @example
     * set.add(new Expression('root.users.user'));
     * set.add(new Expression('..script'));
     */
    add(expression) {
      if (this._sealed) {
        throw new TypeError(
          "ExpressionSet is sealed. Create a new ExpressionSet to add more expressions."
        );
      }
      if (this._patterns.has(expression.pattern)) return this;
      this._patterns.add(expression.pattern);
      if (expression.hasDeepWildcard()) {
        const lastSeg2 = expression.segments[expression.segments.length - 1];
        if (lastSeg2 && lastSeg2.type !== "deep-wildcard" && lastSeg2.tag !== "*") {
          const tag2 = lastSeg2.tag;
          if (!this._deepByTerminalTag.has(tag2)) this._deepByTerminalTag.set(tag2, []);
          this._deepByTerminalTag.get(tag2).push(expression);
        } else {
          this._deepWildcards.push(expression);
        }
        return this;
      }
      const depth = expression.length;
      const lastSeg = expression.segments[expression.segments.length - 1];
      const tag = lastSeg?.tag;
      if (!tag || tag === "*") {
        if (!this._wildcardByDepth.has(depth)) this._wildcardByDepth.set(depth, []);
        this._wildcardByDepth.get(depth).push(expression);
      } else {
        const key = `${depth}:${tag}`;
        if (!this._byDepthAndTag.has(key)) this._byDepthAndTag.set(key, []);
        this._byDepthAndTag.get(key).push(expression);
      }
      return this;
    }
    /**
     * Add multiple expressions at once.
     *
     * @param {import('./Expression.js').default[]} expressions - Array of Expression instances
     * @returns {this} for chaining
     *
     * @example
     * set.addAll([
     *   new Expression('root.users.user'),
     *   new Expression('root.config.setting'),
     * ]);
     */
    addAll(expressions) {
      for (const expr of expressions) this.add(expr);
      return this;
    }
    /**
     * Check whether a pattern string is already present in the set.
     *
     * @param {import('./Expression.js').default} expression
     * @returns {boolean}
     */
    has(expression) {
      return this._patterns.has(expression.pattern);
    }
    /**
     * Number of expressions in the set.
     * @type {number}
     */
    get size() {
      return this._patterns.size;
    }
    /**
     * Seal the set against further modifications.
     * Useful to prevent accidental mutations after config is built.
     * Calling add() or addAll() on a sealed set throws a TypeError.
     *
     * @returns {this}
     */
    seal() {
      this._sealed = true;
      return this;
    }
    /**
     * Whether the set has been sealed.
     * @type {boolean}
     */
    get isSealed() {
      return this._sealed;
    }
    /**
     * Test whether the matcher's current path matches any expression in the set.
     *
     * Evaluation order (cheapest → most expensive):
     *  1. Exact depth + tag bucket  — O(1) lookup, typically 0–2 expressions
     *  2. Depth-only wildcard bucket — O(1) lookup, rare
     *  3. Deep-wildcard list         — always checked, but usually small
     *
     * @param {import('./Matcher.js').default} matcher - Matcher instance (or readOnly view)
     * @returns {boolean} true if any expression matches the current path
     *
     * @example
     * if (stopNodes.matchesAny(matcher)) {
     *   // handle stop node
     * }
     */
    matchesAny(matcher) {
      return this.findMatch(matcher) !== null;
    }
    /**
    * Find and return the first Expression that matches the matcher's current path.
    *
    * Uses the same evaluation order as matchesAny (cheapest → most expensive):
    *  1. Exact depth + tag bucket
    *  2. Depth-only wildcard bucket
    *  3. Deep-wildcard list
    *
    * @param {import('./Matcher.js').default} matcher - Matcher instance (or readOnly view)
    * @returns {import('./Expression.js').default | null} the first matching Expression, or null
    *
    * @example
    * const expr = stopNodes.findMatch(matcher);
    * if (expr) {
    *   // access expr.config, expr.pattern, etc.
    * }
    */
    findMatch(matcher) {
      const depth = matcher.getDepth();
      const tag = matcher.getCurrentTag();
      const exactKey = `${depth}:${tag}`;
      const exactBucket = this._byDepthAndTag.get(exactKey);
      if (exactBucket) {
        for (let i = 0; i < exactBucket.length; i++) {
          if (matcher.matches(exactBucket[i])) return exactBucket[i];
        }
      }
      const wildcardBucket = this._wildcardByDepth.get(depth);
      if (wildcardBucket) {
        for (let i = 0; i < wildcardBucket.length; i++) {
          if (matcher.matches(wildcardBucket[i])) return wildcardBucket[i];
        }
      }
      const deepBucket = this._deepByTerminalTag.get(tag);
      if (deepBucket) {
        for (let i = 0; i < deepBucket.length; i++) {
          if (matcher.matches(deepBucket[i])) return deepBucket[i];
        }
      }
      for (let i = 0; i < this._deepWildcards.length; i++) {
        if (matcher.matches(this._deepWildcards[i])) return this._deepWildcards[i];
      }
      return null;
    }
  };

  // node_modules/path-expression-matcher/src/Matcher.js
  var MatcherView = class {
    /**
     * @param {Matcher} matcher - The parent Matcher instance to read from.
     */
    constructor(matcher) {
      this._matcher = matcher;
    }
    /**
     * Get the path separator used by the parent matcher.
     * @returns {string}
     */
    get separator() {
      return this._matcher.separator;
    }
    /**
     * Get current tag name.
     * @returns {string|undefined}
     */
    getCurrentTag() {
      const path = this._matcher.path;
      return path.length > 0 ? path[path.length - 1].tag : void 0;
    }
    /**
     * Get current namespace.
     * @returns {string|undefined}
     */
    getCurrentNamespace() {
      const path = this._matcher.path;
      return path.length > 0 ? path[path.length - 1].namespace : void 0;
    }
    /**
     * Get current node's attribute value.
     * @param {string} attrName
     * @returns {*}
     */
    getAttrValue(attrName) {
      const path = this._matcher.path;
      if (path.length === 0) return void 0;
      return path[path.length - 1].values?.[attrName];
    }
    /**
     * Check if current node has an attribute.
     * @param {string} attrName
     * @returns {boolean}
     */
    hasAttr(attrName) {
      const path = this._matcher.path;
      if (path.length === 0) return false;
      const current = path[path.length - 1];
      return current.values !== void 0 && attrName in current.values;
    }
    /**
     * Get the value of a "kept" attribute from the nearest ancestor (or
     * current node) that declared it via `push(tag, attrs, ns, { keep: [...] })`.
     * @param {string} attrName
     * @returns {*}
     */
    getAnyParentAttr(attrName) {
      return this._matcher.getAnyParentAttr(attrName);
    }
    /**
     * Check whether any ancestor (or the current node) kept the given
     * attribute via `push(tag, attrs, ns, { keep: [...] })`.
     * @param {string} attrName
     * @returns {boolean}
     */
    hasAnyParentAttr(attrName) {
      return this._matcher.hasAnyParentAttr(attrName);
    }
    /**
     * Get current node's sibling position (child index in parent).
     * @returns {number}
     */
    getPosition() {
      const path = this._matcher.path;
      if (path.length === 0) return -1;
      return path[path.length - 1].position ?? 0;
    }
    /**
     * Get current node's repeat counter (occurrence count of this tag name).
     * @returns {number}
     */
    getCounter() {
      const path = this._matcher.path;
      if (path.length === 0) return -1;
      return path[path.length - 1].counter ?? 0;
    }
    /**
     * Get current node's sibling index (alias for getPosition).
     * @returns {number}
     * @deprecated Use getPosition() or getCounter() instead
     */
    getIndex() {
      return this.getPosition();
    }
    /**
     * Get current path depth.
     * @returns {number}
     */
    getDepth() {
      return this._matcher.path.length;
    }
    /**
     * Get path as string.
     * @param {string} [separator] - Optional separator (uses default if not provided)
     * @param {boolean} [includeNamespace=true]
     * @returns {string}
     */
    toString(separator, includeNamespace = true) {
      return this._matcher.toString(separator, includeNamespace);
    }
    /**
     * Get path as array of tag names.
     * @returns {string[]}
     */
    toArray() {
      return this._matcher.path.map((n) => n.tag);
    }
    /**
     * Match current path against an Expression.
     * @param {Expression} expression
     * @returns {boolean}
     */
    matches(expression) {
      return this._matcher.matches(expression);
    }
    /**
     * Match any expression in the given set against the current path.
     * @param {ExpressionSet} exprSet
     * @returns {boolean}
     */
    matchesAny(exprSet) {
      return exprSet.matchesAny(this._matcher);
    }
  };
  var Matcher = class {
    /**
     * Create a new Matcher.
     * @param {Object} [options={}]
     * @param {string} [options.separator='.'] - Default path separator
     */
    constructor(options = {}) {
      this.separator = options.separator || ".";
      this.path = [];
      this.siblingStacks = [];
      this._pathStringCache = null;
      this._view = new MatcherView(this);
      this._keptAttrs = [];
    }
    /**
     * Push a new tag onto the path.
     * @param {string} tagName
     * @param {Object|null} [attrValues=null]
     * @param {string|null} [namespace=null]
     * @param {Object|null} [options=null]
     * @param {string[]} [options.keep] - Names of attributes (from attrValues)
     */
    push(tagName, attrValues = null, namespace = null, options = null) {
      this._pathStringCache = null;
      if (this.path.length > 0) {
        this.path[this.path.length - 1].values = void 0;
      }
      const currentLevel = this.path.length;
      let level = this.siblingStacks[currentLevel];
      if (!level) {
        level = { counts: /* @__PURE__ */ new Map(), total: 0 };
        this.siblingStacks[currentLevel] = level;
      }
      const siblingKey = namespace ? `${namespace}:${tagName}` : tagName;
      const counter = level.counts.get(siblingKey) || 0;
      const position = level.total;
      level.counts.set(siblingKey, counter + 1);
      level.total++;
      const node = {
        tag: tagName,
        position,
        counter
      };
      if (namespace !== null && namespace !== void 0) {
        node.namespace = namespace;
      }
      if (attrValues !== null && attrValues !== void 0) {
        node.values = attrValues;
      }
      this.path.push(node);
      const depth = this.path.length;
      const keep = options !== null ? options.keep : null;
      if (keep !== null && keep !== void 0 && keep.length > 0 && attrValues) {
        for (let i = 0; i < keep.length; i++) {
          const name = keep[i];
          if (attrValues[name] !== void 0) {
            this._keptAttrs.push({ depth, name, value: attrValues[name] });
          }
        }
      }
    }
    /**
     * Pop the last tag from the path.
     * @returns {Object|undefined} The popped node
     */
    pop() {
      if (this.path.length === 0) return void 0;
      this._pathStringCache = null;
      const node = this.path.pop();
      if (this.siblingStacks.length > this.path.length + 1) {
        this.siblingStacks.length = this.path.length + 1;
      }
      const poppedDepth = this.path.length + 1;
      while (this._keptAttrs.length > 0 && this._keptAttrs[this._keptAttrs.length - 1].depth >= poppedDepth) {
        this._keptAttrs.pop();
      }
      return node;
    }
    /**
     * Update current node's attribute values.
     * Useful when attributes are parsed after push.
     * @param {Object} attrValues
     */
    updateCurrent(attrValues) {
      if (this.path.length > 0) {
        const current = this.path[this.path.length - 1];
        if (attrValues !== null && attrValues !== void 0) {
          current.values = attrValues;
        }
      }
    }
    /**
     * Get current tag name.
     * @returns {string|undefined}
     */
    getCurrentTag() {
      return this.path.length > 0 ? this.path[this.path.length - 1].tag : void 0;
    }
    /**
     * Get current namespace.
     * @returns {string|undefined}
     */
    getCurrentNamespace() {
      return this.path.length > 0 ? this.path[this.path.length - 1].namespace : void 0;
    }
    /**
     * Get current node's attribute value.
     * @param {string} attrName
     * @returns {*}
     */
    getAttrValue(attrName) {
      if (this.path.length === 0) return void 0;
      return this.path[this.path.length - 1].values?.[attrName];
    }
    /**
     * Check if current node has an attribute.
     * @param {string} attrName
     * @returns {boolean}
     */
    hasAttr(attrName) {
      if (this.path.length === 0) return false;
      const current = this.path[this.path.length - 1];
      return current.values !== void 0 && attrName in current.values;
    }
    /**
     * Get the value of a "kept" attribute from the nearest ancestor (or
     * current node) that declared it via `push(tag, attrs, ns, { keep: [...] })`.
     * Unlike getAttrValue(), this works regardless of how deep the path has
     * gone since the attribute was pushed — but only for attribute names that
     * were explicitly marked with `keep` at push time. Cost is proportional to
     * the number of currently-kept attributes (typically 0-3), not path depth.
     * @param {string} attrName
     * @returns {*} the value, or undefined if no ancestor kept this attribute
     */
    getAnyParentAttr(attrName) {
      const kept = this._keptAttrs;
      for (let i = kept.length - 1; i >= 0; i--) {
        if (kept[i].name === attrName) return kept[i].value;
      }
      return void 0;
    }
    /**
     * Check whether any ancestor (or the current node) kept the given
     * attribute via `push(tag, attrs, ns, { keep: [...] })`.
     * @param {string} attrName
     * @returns {boolean}
     */
    hasAnyParentAttr(attrName) {
      const kept = this._keptAttrs;
      for (let i = kept.length - 1; i >= 0; i--) {
        if (kept[i].name === attrName) return true;
      }
      return false;
    }
    /**
     * Get current node's sibling position (child index in parent).
     * @returns {number}
     */
    getPosition() {
      if (this.path.length === 0) return -1;
      return this.path[this.path.length - 1].position ?? 0;
    }
    /**
     * Get current node's repeat counter (occurrence count of this tag name).
     * @returns {number}
     */
    getCounter() {
      if (this.path.length === 0) return -1;
      return this.path[this.path.length - 1].counter ?? 0;
    }
    /**
     * Get current node's sibling index (alias for getPosition).
     * @returns {number}
     * @deprecated Use getPosition() or getCounter() instead
     */
    getIndex() {
      return this.getPosition();
    }
    /**
     * Get current path depth.
     * @returns {number}
     */
    getDepth() {
      return this.path.length;
    }
    /**
     * Get path as string.
     * @param {string} [separator] - Optional separator (uses default if not provided)
     * @param {boolean} [includeNamespace=true]
     * @returns {string}
     */
    toString(separator, includeNamespace = true) {
      const sep2 = separator || this.separator;
      const isDefault = sep2 === this.separator && includeNamespace === true;
      if (isDefault) {
        if (this._pathStringCache !== null) {
          return this._pathStringCache;
        }
        const result = this.path.map(
          (n) => n.namespace ? `${n.namespace}:${n.tag}` : n.tag
        ).join(sep2);
        this._pathStringCache = result;
        return result;
      }
      return this.path.map(
        (n) => includeNamespace && n.namespace ? `${n.namespace}:${n.tag}` : n.tag
      ).join(sep2);
    }
    /**
     * Get path as array of tag names.
     * @returns {string[]}
     */
    toArray() {
      return this.path.map((n) => n.tag);
    }
    /**
     * Reset the path to empty.
     */
    reset() {
      this._pathStringCache = null;
      this.path = [];
      this.siblingStacks = [];
      this._keptAttrs = [];
    }
    /**
     * Match current path against an Expression.
     * @param {Expression} expression
     * @returns {boolean}
     */
    matches(expression) {
      const segments = expression.segments;
      if (segments.length === 0) {
        return false;
      }
      if (expression.hasDeepWildcard()) {
        return this._matchWithDeepWildcard(segments);
      }
      return this._matchSimple(segments);
    }
    /**
     * @private
     */
    _matchSimple(segments) {
      if (this.path.length !== segments.length) {
        return false;
      }
      for (let i = 0; i < segments.length; i++) {
        if (!this._matchSegment(segments[i], this.path[i], i === this.path.length - 1)) {
          return false;
        }
      }
      return true;
    }
    /**
     * @private
     */
    _matchWithDeepWildcard(segments) {
      let pathIdx = this.path.length - 1;
      let segIdx = segments.length - 1;
      while (segIdx >= 0 && pathIdx >= 0) {
        const segment = segments[segIdx];
        if (segment.type === "deep-wildcard") {
          segIdx--;
          if (segIdx < 0) {
            return true;
          }
          const nextSeg = segments[segIdx];
          let found = false;
          for (let i = pathIdx; i >= 0; i--) {
            if (this._matchSegment(nextSeg, this.path[i], i === this.path.length - 1)) {
              pathIdx = i - 1;
              segIdx--;
              found = true;
              break;
            }
          }
          if (!found) {
            return false;
          }
        } else {
          if (!this._matchSegment(segment, this.path[pathIdx], pathIdx === this.path.length - 1)) {
            return false;
          }
          pathIdx--;
          segIdx--;
        }
      }
      return segIdx < 0;
    }
    /**
     * @private
     */
    _matchSegment(segment, node, isCurrentNode) {
      if (segment.tag !== "*" && segment.tag !== node.tag) {
        return false;
      }
      if (segment.namespace !== void 0) {
        if (segment.namespace !== "*" && segment.namespace !== node.namespace) {
          return false;
        }
      }
      if (segment.attrName !== void 0) {
        if (!isCurrentNode) {
          return false;
        }
        if (!node.values || !(segment.attrName in node.values)) {
          return false;
        }
        if (segment.attrValue !== void 0) {
          if (String(node.values[segment.attrName]) !== String(segment.attrValue)) {
            return false;
          }
        }
      }
      if (segment.position !== void 0) {
        if (!isCurrentNode) {
          return false;
        }
        const counter = node.counter ?? 0;
        if (segment.position === "first" && counter !== 0) {
          return false;
        } else if (segment.position === "odd" && counter % 2 !== 1) {
          return false;
        } else if (segment.position === "even" && counter % 2 !== 0) {
          return false;
        } else if (segment.position === "nth" && counter !== segment.positionValue) {
          return false;
        }
      }
      return true;
    }
    /**
     * Match any expression in the given set against the current path.
     * @param {ExpressionSet} exprSet
     * @returns {boolean}
     */
    matchesAny(exprSet) {
      return exprSet.matchesAny(this);
    }
    /**
     * Create a snapshot of current state.
     * @returns {Object}
     */
    snapshot() {
      return {
        path: this.path.map((node) => ({ ...node })),
        siblingStacks: this.siblingStacks.map((level) => level ? { counts: new Map(level.counts), total: level.total } : level),
        keptAttrs: this._keptAttrs.map((entry) => ({ ...entry }))
      };
    }
    /**
     * Restore state from snapshot.
     * @param {Object} snapshot
     */
    restore(snapshot) {
      this._pathStringCache = null;
      this.path = snapshot.path.map((node) => ({ ...node }));
      this.siblingStacks = snapshot.siblingStacks.map((level) => level ? { counts: new Map(level.counts), total: level.total } : level);
      this._keptAttrs = (snapshot.keptAttrs || []).map((entry) => ({ ...entry }));
    }
    /**
     * Return the read-only {@link MatcherView} for this matcher.
     *
     * The same instance is returned on every call — no allocation occurs.
     * It always reflects the current parser state and is safe to pass to
     * user callbacks without risk of accidental mutation.
     *
     * @returns {MatcherView}
     *
     * @example
     * const view = matcher.readOnly();
     * // pass view to callbacks — it stays in sync automatically
     * view.matches(expr);       // ✓
     * view.getCurrentTag();     // ✓
     * // view.push(...)         // ✗ method does not exist — caught by TypeScript
     */
    readOnly() {
      return this._view;
    }
  };

  // node_modules/is-unsafe/src/contexts/html.js
  var HTML_PATTERNS = [
    {
      id: "html-script-open",
      description: "<script opening tag",
      pattern: /<script[\s>/]/i
    },
    {
      id: "html-script-close",
      description: "<\/script closing tag",
      pattern: /<\/script[\s>]/i
    },
    {
      id: "html-javascript-protocol",
      description: "javascript: URI scheme (with optional whitespace/encoding)",
      // Handles j&#x61;vascript:, j\u0061vascript:, and whitespace variants
      pattern: /j[\t\n\r ]*a[\t\n\r ]*v[\t\n\r ]*a[\t\n\r ]*s[\t\n\r ]*c[\t\n\r ]*r[\t\n\r ]*i[\t\n\r ]*p[\t\n\r ]*t[\t\n\r ]*:/i
    },
    {
      id: "html-vbscript-protocol",
      description: "vbscript: URI scheme",
      pattern: /vbscript[\t\n\r ]*:/i
    },
    {
      id: "html-data-html",
      description: "data:text/html URI \u2014 can execute scripts in browsers",
      pattern: /data[\t\n\r ]*:[\t\n\r ]*text\/html/i
    },
    {
      id: "html-data-xhtml",
      description: "data:application/xhtml+xml URI",
      pattern: /data[\t\n\r ]*:[\t\n\r ]*application\/xhtml/i
    },
    {
      id: "html-data-svg",
      description: "data:image/svg+xml URI \u2014 can execute scripts",
      pattern: /data[\t\n\r ]*:[\t\n\r ]*image\/svg\+xml/i
    },
    {
      id: "html-inline-event-handler",
      description: "Inline event handler attributes: onclick=, onerror=, onload=, etc.",
      // \bon ensures we match a word boundary so "phonetic=" is not caught
      pattern: /\bon\w{1,30}\s*=/i
    },
    {
      id: "html-entity-obfuscated-script",
      description: "HTML-entity-encoded <script (e.g. &#x3C;script or &lt;script)",
      // Entities include optional trailing semicolon: &#x3C; or &#x3C (both valid in HTML5)
      pattern: /(?:&#x0*3[Cc];?|&#0*60;?|&lt;)\s*script/i
    },
    {
      id: "html-entity-obfuscated-javascript",
      description: 'HTML-entity-encoded javascript: (partial \u2014 catches common &#106; or &#x6a; for "j")',
      pattern: /(?:&#x0*6[Aa];?|&#0*106;?)\s*(?:&#x0*61;?|a)[\s\S]{0,80}script\s*:/i
    },
    {
      id: "html-style-expression",
      description: "CSS expression() \u2014 IE-era code execution in style attributes",
      pattern: /style[\s\S]{0,20}expression\s*\(/i
    },
    {
      id: "html-object-embed",
      description: "<object or <embed tags that can load active content",
      pattern: /<(?:object|embed)[\s>/]/i
    },
    {
      id: "html-base-tag",
      description: "<base href= \u2014 can hijack all relative URLs on a page",
      pattern: /<base[\s>]/i
    },
    {
      id: "html-meta-refresh",
      description: '<meta http-equiv="refresh" \u2014 can redirect users',
      pattern: /<meta[\s\S]{0,40}http-equiv[\s\S]{0,20}refresh/i
    },
    {
      id: "html-srcdoc",
      description: "srcdoc= attribute on iframes \u2014 embeds HTML that can run scripts",
      pattern: /srcdoc\s*=/i
    },
    {
      id: "html-iframe",
      description: "<iframe tag",
      pattern: /<iframe[\s>/]/i
    },
    {
      id: "html-form",
      description: "<form tag \u2014 can be used for phishing / credential harvesting injection",
      pattern: /<form[\s>/]/i
    }
  ];
  var html_default = HTML_PATTERNS;

  // node_modules/is-unsafe/src/contexts/xml.js
  var XML_PATTERNS = [
    {
      id: "xml-cdata-injection",
      description: "CDATA section injection: <![CDATA[ breaks out of text node context",
      pattern: /<!\[CDATA\[/i
    },
    {
      id: "xml-cdata-close",
      description: "CDATA close sequence: ]]> can terminate an enclosing CDATA section",
      pattern: /\]\]>/
    },
    {
      id: "xml-processing-instruction",
      description: "XML processing instruction: <?xml-stylesheet or <?php etc.",
      pattern: /<\?(?:xml[\- ]|php|asp)/i
    },
    {
      id: "xml-doctype-injection",
      description: "DOCTYPE declaration embedded in content \u2014 can define entities",
      // Match <!DOCTYPE followed by end-of-string, whitespace, or [ (internal subset)
      pattern: /<!DOCTYPE(?:[\s[]|$)/i
    },
    {
      id: "xml-entity-system",
      description: "SYSTEM keyword \u2014 used in external entity declarations (XXE)",
      pattern: /\bSYSTEM\s+["']/i
    },
    {
      id: "xml-entity-public",
      description: "PUBLIC keyword \u2014 used in external entity declarations (XXE)",
      pattern: /\bPUBLIC\s+["']/i
    },
    {
      id: "xml-entity-declaration",
      description: "<!ENTITY declaration \u2014 defines entities, potential XXE or entity expansion",
      pattern: /<!ENTITY[\s%]/i
    },
    {
      id: "xml-billion-laughs",
      description: "Entity reference chaining / billion laughs: repeated &eX; style references",
      // Heuristic: 3+ consecutive entity refs suggests expansion attack
      pattern: /(?:&\w{1,20};){3,}/
    },
    {
      id: "xml-namespace-confusion",
      description: "xmlns: attribute injection \u2014 can redefine namespaces to confuse parsers",
      // pattern: /\bxmlns\s*(?::\w{1,40})?\s*=/i,
      pattern: /\bxmlns(?::\w{1,40})?\s*=/i
    },
    {
      id: "xml-comment-injection",
      description: "<!-- comment injection \u2014 can hide content from some parsers",
      pattern: /<!--/
    },
    {
      id: "xml-comment-close",
      description: "--> closes an enclosing XML comment",
      pattern: /-->/
    },
    {
      id: "xml-pi-close",
      description: "?> closes an enclosing processing instruction",
      pattern: /\?>/
    }
  ];
  var xml_default = XML_PATTERNS;

  // node_modules/is-unsafe/src/contexts/svg.js
  var SVG_PATTERNS = [
    {
      id: "svg-script-element",
      description: "<script element inside SVG executes JavaScript",
      pattern: /<script[\s>/]/i
    },
    {
      id: "svg-xlink-href-javascript",
      description: "xlink:href with javascript: \u2014 classic SVG XSS via <a> or <use>",
      pattern: /xlink\s*:\s*href\s*=\s*["']?\s*javascript\s*:/i
    },
    {
      id: "svg-href-javascript",
      description: "href= with javascript: in SVG context (<a>, <animate>, etc.)",
      pattern: /href\s*=\s*["']?\s*javascript\s*:/i
    },
    {
      id: "svg-foreignobject",
      description: "<foreignObject embeds HTML inside SVG \u2014 can execute scripts",
      pattern: /<foreignObject[\s>/]/i
    },
    {
      id: "svg-use-external",
      description: "<use xlink:href or href pointing to external resource (non-fragment URL)",
      // Match <use with href= where the value starts with a non-# character (external URL)
      // [\"'][^#] catches quoted values not starting with #; [^\"'#\s>] catches unquoted
      pattern: /<use[\s\S]{0,60}(?:xlink\s*:\s*)?href\s*=\s*(?:["'][^#]|[^"'#\s>])/i
    },
    {
      id: "svg-animate-href",
      description: '<animate attributeName="href" \u2014 can dynamically change href to javascript:',
      pattern: /<animate[\s\S]{0,80}attributeName\s*=\s*["'][\s]*href["']/i
    },
    {
      id: "svg-animate-xlinkhref",
      description: '<animate attributeName="xlink:href"',
      pattern: /<animate[\s\S]{0,80}attributeName\s*=\s*["'][\s]*xlink\s*:\s*href["']/i
    },
    {
      id: "svg-set-javascript",
      description: '<set to="javascript:..." \u2014 sets an attribute to a javascript: URI',
      pattern: /<set[\s\S]{0,80}to\s*=\s*["']?\s*javascript\s*:/i
    },
    {
      id: "svg-event-handler",
      description: "SVG-specific event handler attributes: onload=, onerror=, onactivate=, etc.",
      pattern: /\bon(?:load|error|activate|begin|end|repeat|focus|blur|click|mouse\w{1,20}|key\w{1,20})\s*=/i
    },
    {
      id: "svg-handler-generic",
      description: "Generic on* handler catch-all for SVG attributes",
      pattern: /\bon\w{1,30}\s*=/i
    },
    {
      id: "svg-filter-feimage",
      description: "<feImage href= \u2014 filter primitive that can load external resources",
      pattern: /<feImage[\s\S]{0,80}(?:xlink\s*:\s*)?href\s*=/i
    },
    {
      id: "svg-image-external",
      description: "<image xlink:href with http/https or javascript protocol",
      pattern: /<image[\s\S]{0,80}(?:xlink\s*:\s*)?href\s*=\s*["']?\s*(?:https?|javascript)\s*:/i
    },
    {
      id: "svg-style-javascript",
      description: "style= attribute containing javascript: (e.g. background:url(javascript:...))",
      pattern: /style\s*=[\s\S]{0,60}javascript\s*:/i
    }
  ];
  var svg_default = SVG_PATTERNS;

  // node_modules/is-unsafe/src/contexts/sql.js
  var SQL_PATTERNS = [
    {
      id: "sql-block-comment-open",
      description: "SQL block comment open: /* ... */ \u2014 unusual in legitimate user text",
      pattern: /\/\*/
    },
    {
      id: "sql-union-select",
      description: "UNION SELECT \u2014 most common SQL injection aggregation attack",
      pattern: /\bUNION\s{1,20}(?:ALL\s{1,20})?SELECT\b/i
    },
    {
      id: "sql-drop-table",
      description: "DROP TABLE \u2014 destructive DDL injection",
      pattern: /\bDROP\s{1,20}TABLE\b/i
    },
    {
      id: "sql-drop-database",
      description: "DROP DATABASE \u2014 destructive DDL injection",
      pattern: /\bDROP\s{1,20}DATABASE\b/i
    },
    {
      id: "sql-insert-into",
      description: "INSERT INTO \u2014 data injection",
      pattern: /\bINSERT\s{1,20}INTO\b/i
    },
    {
      id: "sql-delete-from",
      description: "DELETE FROM \u2014 data deletion injection",
      pattern: /\bDELETE\s{1,20}FROM\b/i
    },
    {
      id: "sql-update-set",
      description: "UPDATE ... SET \u2014 data modification injection",
      // Allows arbitrary content between UPDATE and SET (table name, alias, etc.)
      pattern: /\bUPDATE\b[\s\S]{1,60}\bSET\b/i
    },
    {
      id: "sql-exec-xp",
      description: "EXEC xp_ \u2014 MSSQL extended stored procedure execution",
      pattern: /\bEXEC(?:UTE)?\s{1,20}xp_/i
    },
    {
      id: "sql-tautology-string",
      description: `Classic string tautology: ' OR '1'='1 or " OR "1"="1"`,
      // Last quote is optional — injection may truncate it: ' OR '1'='1--
      pattern: /'\s{0,10}OR\s{0,10}'[^']{0,20}'\s*=\s*'[^']{0,20}/i
    },
    {
      id: "sql-tautology-numeric",
      description: "Numeric tautology: OR 1=1",
      pattern: /\bOR\s{1,10}1\s*=\s*1\b/i
    },
    {
      id: "sql-always-true-zero",
      description: "Numeric tautology: OR 0=0",
      pattern: /\bOR\s{1,10}0\s*=\s*0\b/i
    },
    {
      id: "sql-sleep-benchmark",
      description: "Time-based blind injection: SLEEP() or BENCHMARK()",
      pattern: /\b(?:SLEEP|BENCHMARK)\s*\(/i
    },
    {
      id: "sql-waitfor-delay",
      description: "MSSQL time-based blind injection: WAITFOR DELAY",
      pattern: /\bWAITFOR\s{1,20}DELAY\b/i
    },
    {
      id: "sql-char-function",
      description: "CHAR() function \u2014 used to obfuscate injected strings",
      pattern: /\bCHAR\s*\(\s*\d{1,3}/i
    },
    {
      id: "sql-information-schema",
      description: "INFORMATION_SCHEMA \u2014 reconnaissance query for table/column enumeration",
      pattern: /\bINFORMATION_SCHEMA\b/i
    }
  ];
  var sql_default = SQL_PATTERNS;

  // node_modules/is-unsafe/src/contexts/shell.js
  var SHELL_PATTERNS = [
    {
      id: "shell-path-traversal-unix",
      description: "Unix path traversal: ../  \u2014 climbing the directory tree",
      pattern: /\.\.\//
    },
    {
      id: "shell-path-traversal-windows",
      description: "Windows path traversal: ..\\ \u2014 climbing the directory tree",
      pattern: /\.\.\\/
    },
    {
      id: "shell-path-traversal-encoded",
      description: "URL-encoded path traversal: %2e%2e or %2f variants",
      pattern: /%2e%2e|%2f\.\.|\.\.%2f/i
    },
    {
      id: "shell-null-byte",
      description: "Null byte injection: \\x00 or %00 \u2014 truncates strings in C-backed functions",
      pattern: /\x00|%00/
    },
    {
      id: "shell-semicolon",
      description: "Semicolon command separator: cmd1; cmd2",
      pattern: /;/
    },
    {
      id: "shell-pipe",
      description: "Pipe operator: cmd1 | cmd2",
      pattern: /\|/
    },
    {
      id: "shell-and-operator",
      description: "AND operator: cmd1 && cmd2",
      pattern: /&&/
    },
    {
      id: "shell-or-operator",
      description: "OR operator: cmd1 || cmd2",
      pattern: /\|\|/
    },
    {
      id: "shell-backtick",
      description: "Backtick command substitution: `cmd`",
      pattern: /`/
    },
    {
      id: "shell-dollar-paren",
      description: "Dollar-paren command substitution: $(cmd)",
      pattern: /\$\(/
    },
    {
      id: "shell-dollar-brace",
      description: "Dollar-brace variable expansion: ${var} \u2014 can be abused for injection",
      pattern: /\$\{/
    },
    {
      id: "shell-redirect-out",
      description: "Output redirection: cmd > file or cmd >> file",
      pattern: />{1,2}/
    },
    {
      id: "shell-redirect-in",
      description: "Input redirection: cmd < file",
      pattern: /</
    },
    {
      id: "shell-newline-injection",
      description: "Newline injection: \\n or \\r \u2014 can inject new shell commands",
      pattern: /[\n\r]/
    },
    {
      id: "shell-glob-star",
      description: "Glob expansion: * or ? \u2014 can expand to unintended files",
      // Only flag when combined with path separators to reduce false positives
      pattern: /[/\\][*?]/
    },
    {
      id: "shell-absolute-root",
      description: "Absolute root path injection: string starting with / or \\ (Windows UNC)",
      pattern: /^(?:\/|\\\\)/
    },
    {
      id: "shell-windows-drive",
      description: "Windows drive letter path injection: C:\\ or D:/",
      pattern: /^[a-zA-Z]:[/\\]/
    },
    {
      id: "shell-curl-wget",
      description: "curl/wget with URL or flags \u2014 can exfiltrate data or download payloads",
      // Require a URL scheme (http/https/ftp) or a flag (-) to reduce false positives
      // "curl is a tool" won't match; "curl http://..." or "curl -s ..." will
      pattern: /\b(?:curl|wget)\s+(?:https?:\/\/|ftp:\/\/|-)/i
    }
  ];
  var shell_default = SHELL_PATTERNS;

  // node_modules/is-unsafe/src/contexts/redos.js
  var REDOS_PATTERNS = [
    {
      id: "redos-nested-quantifier-plus",
      description: "Nested + quantifier inside a group with outer quantifier: (a+)+, (.+b)*, etc.",
      // Matches any group containing a + quantifier, with an outer * or + — catches (a+)+, (.+b)*, etc.
      pattern: /\([^)]*\+[^)]*\)[+*]/
    },
    {
      id: "redos-nested-quantifier-star",
      description: "Nested * quantifier: (a*)* or (a*)+ \u2014 catastrophic backtracking",
      pattern: /\([^)]*\*[^)]*\)[*+]/
    },
    {
      id: "redos-nested-groups",
      description: "Doubly nested quantified groups: ((a+)+) \u2014 guaranteed catastrophic",
      pattern: /\(\([^)]{0,40}\)[+*]\)[+*]/
    },
    {
      id: "redos-alternation-overlap",
      description: "Overlapping alternation under quantifier: (a|a)+ \u2014 ambiguous NFA paths",
      // Detect repeated identical alternatives under a quantifier
      pattern: /\(([^|()]{1,20})\|(?:\1)(?:\|[^|()]{1,20}){0,5}\)[+*?]{1,2}/
    },
    {
      id: "redos-star-plus-concat",
      description: "(x*x)+ pattern \u2014 triggers super-linear backtracking",
      pattern: /\([^)]{0,10}\*[^)]{0,10}\)[+*]/
    },
    {
      id: "redos-dot-star-greedy",
      description: "(.*){n,} or (.+){n,} \u2014 repeated greedy dot quantifiers",
      pattern: /\(\.[*+]\)\{?\d/
    },
    {
      id: "redos-large-repetition",
      description: "Very large fixed or range repetition count {1000,} or {1000,n} \u2014 denial of service via backtracking",
      // Matches { followed by 4+ digits (≥1000), then optional ,digits }
      pattern: /\{\d{4,}(?:,\d*)?\}/
    },
    {
      id: "redos-catastrophic-alternation",
      description: "Long alternation with many similar branches \u2014 polynomial backtracking risk",
      // Heuristic: 10+ pipe-separated alternatives in a single group
      pattern: /\([^)]{0,200}(?:\|[^|)]{0,50}){9,}\)/
    }
  ];
  var redos_default = REDOS_PATTERNS;

  // node_modules/is-unsafe/src/contexts/nosql.js
  var sep = `["'\\s]*:`;
  var NOSQL_PATTERNS = [
    // ─── MongoDB $ operator injection ────────────────────────────────────────
    {
      id: "nosql-where-operator",
      description: "$where \u2014 executes arbitrary JavaScript server-side in MongoDB",
      pattern: new RegExp(`\\$where${sep}`, "i")
    },
    {
      id: "nosql-ne-operator",
      description: '$ne \u2014 "not equal" operator used to bypass equality checks',
      pattern: new RegExp(`\\$ne${sep}`, "i")
    },
    {
      id: "nosql-gt-operator",
      description: '$gt \u2014 "greater than" used to bypass password/value checks',
      pattern: new RegExp(`\\$gte?${sep}`, "i")
    },
    {
      id: "nosql-lt-operator",
      description: '$lt / $lte \u2014 "less than" bypass variants',
      pattern: new RegExp(`\\$lte?${sep}`, "i")
    },
    {
      id: "nosql-regex-operator",
      description: "$regex \u2014 can be used to extract data character by character (blind injection)",
      pattern: new RegExp(`\\$regex${sep}`, "i")
    },
    {
      id: "nosql-or-operator",
      description: "$or \u2014 logical OR; used to create always-true conditions",
      pattern: new RegExp(`\\$or${sep}\\s*\\[`, "i")
    },
    {
      id: "nosql-and-operator",
      description: "$and \u2014 logical AND operator injection",
      pattern: new RegExp(`\\$and${sep}\\s*\\[`, "i")
    },
    {
      id: "nosql-nor-operator",
      description: "$nor \u2014 logical NOR operator injection",
      pattern: new RegExp(`\\$nor${sep}\\s*\\[`, "i")
    },
    {
      id: "nosql-exists-operator",
      description: "$exists \u2014 can enumerate fields to determine schema",
      pattern: new RegExp(`\\$exists${sep}`, "i")
    },
    {
      id: "nosql-in-operator",
      description: "$in \u2014 matches any value in a list; can enumerate values",
      pattern: new RegExp(`\\$in${sep}\\s*\\[`, "i")
    },
    {
      id: "nosql-expr-operator",
      description: "$expr \u2014 allows aggregation expressions in queries (MongoDB 3.6+)",
      pattern: new RegExp(`\\$expr${sep}`, "i")
    },
    {
      id: "nosql-function-operator",
      description: "$function \u2014 executes arbitrary JavaScript in MongoDB 4.4+",
      pattern: new RegExp(`\\$function${sep}`, "i")
    },
    {
      id: "nosql-accumulator-operator",
      description: "$accumulator \u2014 custom aggregation with arbitrary JS execution",
      pattern: new RegExp(`\\$accumulator${sep}`, "i")
    },
    // ─── Prototype pollution ─────────────────────────────────────────────────
    {
      id: "nosql-proto-pollution",
      description: "__proto__ \u2014 prototype pollution via object key injection",
      pattern: /__proto__/
    },
    {
      id: "nosql-constructor-prototype",
      description: "constructor.prototype \u2014 alternative prototype pollution vector (dot notation or JSON key)",
      // Matches dot-notation (obj.constructor.prototype) and JSON key adjacency
      // ("constructor": {"prototype": ...})
      pattern: /constructor[\s"':.,{\[]*prototype/i
    },
    {
      id: "nosql-proto-bracket",
      description: '["__proto__"] \u2014 bracket-notation prototype pollution',
      pattern: /\[["']__proto__["']\]/
    }
  ];
  var nosql_default = NOSQL_PATTERNS;

  // node_modules/is-unsafe/src/contexts/log.js
  var LOG_PATTERNS = [
    // ─── CRLF / newline injection ─────────────────────────────────────────────
    {
      id: "log-crlf-injection",
      description: "CRLF injection: literal \\r or \\n embeds fake log lines",
      pattern: /[\r\n]/
    },
    {
      id: "log-url-encoded-crlf",
      description: "URL-encoded CRLF: %0d, %0a, %0D, %0A \u2014 decoded by some log parsers",
      pattern: /%0[dDaA]/
    },
    {
      id: "log-unicode-newline",
      description: "Unicode newline variants: U+2028 (line separator), U+2029 (paragraph separator)",
      pattern: /[\u2028\u2029]/
    },
    // ─── Log4Shell / JNDI injection (CVE-2021-44228) ─────────────────────────
    {
      id: "log-log4shell-jndi",
      description: "Log4Shell: ${jndi:...} triggers remote code execution in Apache Log4j",
      pattern: /\$\{jndi\s*:/i
    },
    {
      id: "log-log4shell-obfuscated",
      description: "Obfuscated Log4Shell: ${::-j}... lookup-bypass prefix used to evade WAF detection",
      // ${::- is the Log4j lookup-bypass escape sequence; presence alone is suspicious
      pattern: /\$\{::-/
    },
    {
      id: "log-log4j-lookup",
      description: "Log4j lookup syntax: ${env:...}, ${sys:...}, ${ctx:...} \u2014 data exfiltration",
      pattern: /\$\{(?:env|sys|ctx|main|map|sd|web|docker|k8s|spring)\s*:/i
    },
    // ─── Server-Side Template Injection (SSTI) in log messages ───────────────
    {
      id: "log-ssti-double-brace",
      description: "SSTI double-brace: {{expression}} \u2014 Jinja2, Twig, Handlebars, etc.",
      pattern: /\{\{[\s\S]{0,80}\}\}/
    },
    {
      id: "log-ssti-hash-brace",
      description: "SSTI hash-brace: #{expression} \u2014 Thymeleaf, Velocity, Ruby ERB",
      pattern: /#\{[\s\S]{0,80}\}/
    },
    {
      id: "log-ssti-dollar-brace",
      description: "SSTI/EL injection: ${expression with operators or method calls} \u2014 JSP EL, Freemarker, SpEL",
      // Require that the ${...} content looks like an expression, not a plain variable name.
      // Flags if the content contains: . ( * + operators, or known SSTI keywords.
      // This avoids flagging ${PATH}, ${HOME} etc. (plain shell variables).
      pattern: /\$\{[^}]*(?:\.|\(|\*|\+|\bclass\b|\bruntime\b|\bprocess\b|\bexec\b)[^}]{0,80}\}/i
    },
    {
      id: "log-ssti-percent-tag",
      description: "SSTI ERB/ASP tag: <%= expression %> \u2014 Ruby ERB, ASP",
      pattern: /<%=[\s\S]{0,80}%>/
    },
    // ─── Null byte ────────────────────────────────────────────────────────────
    {
      id: "log-null-byte",
      description: "Null byte: \\x00 or %00 \u2014 can truncate log entries in C-backed loggers",
      pattern: /\x00|%00/
    },
    // ─── ANSI escape injection ────────────────────────────────────────────────
    {
      id: "log-ansi-escape",
      description: "ANSI escape sequence: ESC[ \u2014 can manipulate terminal output when logs are tailed",
      pattern: /\x1b\[/
    }
  ];
  var log_default = LOG_PATTERNS;

  // node_modules/is-unsafe/src/contexts/sql-strict.js
  var SQL_STRICT_EXTRA = [
    {
      id: "sql-line-comment",
      description: "SQL line comment: -- followed by whitespace or end of string",
      pattern: /--(?:\s|$)/
    },
    {
      id: "sql-stacked-query",
      description: "Stacked queries: semicolon immediately followed by a SQL keyword",
      pattern: /;\s{0,10}(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC)\b/i
    },
    {
      id: "sql-hex-encoding",
      description: "Hex-encoded string injection: 0x41414141 style (MySQL)",
      pattern: /\b0x[0-9a-f]{4,}/i
    }
  ];
  var SQL_STRICT_PATTERNS = [...sql_default, ...SQL_STRICT_EXTRA];
  var sql_strict_default = SQL_STRICT_PATTERNS;

  // node_modules/is-unsafe/src/index.js
  html_default.label = "HTML";
  xml_default.label = "XML";
  svg_default.label = "SVG";
  sql_default.label = "SQL";
  sql_strict_default.label = "SQL-STRICT";
  shell_default.label = "SHELL";
  redos_default.label = "REDOS";
  nosql_default.label = "NOSQL";
  log_default.label = "LOG";
  var VALID_CONTEXTS = Object.freeze({
    HTML: html_default,
    XML: xml_default,
    SVG: svg_default,
    SQL: sql_default,
    "SQL-STRICT": sql_strict_default,
    SHELL: shell_default,
    REDOS: redos_default,
    NOSQL: nosql_default,
    LOG: log_default
  });
  function assertString(value) {
    if (typeof value !== "string") {
      throw new TypeError(
        `is-unsafe: first argument must be a string, got ${typeof value}`
      );
    }
  }
  function assertContext(context) {
    if (context instanceof RegExp) return;
    if (Array.isArray(context)) {
      if (context.length === 0) {
        throw new TypeError("is-unsafe: context must not be an empty array");
      }
      if (Array.isArray(context[0])) {
        for (const list of context) {
          if (!Array.isArray(list) || list.length === 0) {
            throw new TypeError(
              "is-unsafe: each context in the array must be a non-empty pattern array (PatternList)"
            );
          }
        }
      }
      return;
    }
    throw new TypeError(
      `is-unsafe: second argument must be a PatternList (e.g. HTML), an array of PatternLists (e.g. [HTML, XML]), or a RegExp. Got: ${typeof context}`
    );
  }
  function normalise(context) {
    if (context instanceof RegExp) return { lists: null, regex: context };
    if (Array.isArray(context[0])) return { lists: context, regex: null };
    return { lists: [context], regex: null };
  }
  function matchList(value, list) {
    const label = list.label ?? "CUSTOM";
    for (const rule of list) {
      if (rule.pattern.test(value)) {
        return { context: label, id: rule.id, description: rule.description, pattern: rule.pattern };
      }
    }
    return null;
  }
  function isUnsafe(value, context) {
    assertString(value);
    assertContext(context);
    const { lists, regex } = normalise(context);
    if (regex) return regex.test(value);
    for (const list of lists) {
      if (matchList(value, list) !== null) return true;
    }
    return false;
  }

  // node_modules/fast-xml-parser/src/xmlparser/OrderedObjParser.js
  function extractRawAttributes(prefixedAttrs, options) {
    if (!prefixedAttrs) return {};
    const attrs = options.attributesGroupName ? prefixedAttrs[options.attributesGroupName] : prefixedAttrs;
    if (!attrs) return {};
    const rawAttrs = {};
    for (const key in attrs) {
      if (key.startsWith(options.attributeNamePrefix)) {
        const rawName = key.substring(options.attributeNamePrefix.length);
        rawAttrs[rawName] = attrs[key];
      } else {
        rawAttrs[key] = attrs[key];
      }
    }
    return rawAttrs;
  }
  function extractNamespace(rawTagName) {
    if (!rawTagName || typeof rawTagName !== "string") return void 0;
    const colonIndex = rawTagName.indexOf(":");
    if (colonIndex !== -1 && colonIndex > 0) {
      const ns = rawTagName.substring(0, colonIndex);
      if (ns !== "xmlns") {
        return ns;
      }
    }
    return void 0;
  }
  var OrderedObjParser = class {
    constructor(options, externalEntities) {
      this.options = options;
      this.currentNode = null;
      this.tagsNodeStack = [];
      this.parseXml = parseXml;
      this.parseTextData = parseTextData;
      this.resolveNameSpace = resolveNameSpace;
      this.buildAttributesMap = buildAttributesMap;
      this.isItStopNode = isItStopNode;
      this.replaceEntitiesValue = replaceEntitiesValue;
      this.readStopNodeData = readStopNodeData;
      this.saveTextToParentTag = saveTextToParentTag;
      this.addChild = addChild;
      this.ignoreAttributesFn = getIgnoreAttributesFn(this.options.ignoreAttributes);
      this.entityExpansionCount = 0;
      this.currentExpandedLength = 0;
      this.doctypefound = false;
      let namedEntities = { ...XML };
      if (this.options.entityDecoder) {
        this.entityDecoder = this.options.entityDecoder;
      } else {
        if (typeof this.options.htmlEntities === "object") namedEntities = this.options.htmlEntities;
        else if (this.options.htmlEntities === true) namedEntities = { ...COMMON_HTML, ...CURRENCY };
        this.entityDecoder = new EntityDecoder({
          namedEntities: { ...namedEntities, ...externalEntities },
          numericAllowed: this.options.htmlEntities,
          limit: {
            maxTotalExpansions: this.options.processEntities.maxTotalExpansions,
            maxExpandedLength: this.options.processEntities.maxExpandedLength,
            applyLimitsTo: this.options.processEntities.appliesTo
          },
          // onExternalEntity: (name, value) => isUnsafe(value) ? 'block' : 'allow',
          onInputEntity: (name, value) => (
            //TODO: VALID_CONTEXTS.HTML should be set only if this.options.htmlEntities
            isUnsafe(value, [html_default, xml_default]) ? ENTITY_ACTION.BLOCK : ENTITY_ACTION.ALLOW
          )
          //postCheck: resolved => resolved
        });
      }
      this.matcher = new Matcher();
      this.readonlyMatcher = this.matcher.readOnly();
      this.isCurrentNodeStopNode = false;
      this.stopNodeExpressionsSet = new ExpressionSet();
      const stopNodesOpts = this.options.stopNodes;
      if (stopNodesOpts && stopNodesOpts.length > 0) {
        for (let i = 0; i < stopNodesOpts.length; i++) {
          const stopNodeExp = stopNodesOpts[i];
          if (typeof stopNodeExp === "string") {
            this.stopNodeExpressionsSet.add(new Expression(stopNodeExp));
          } else if (stopNodeExp instanceof Expression) {
            this.stopNodeExpressionsSet.add(stopNodeExp);
          }
        }
        this.stopNodeExpressionsSet.seal();
      }
    }
  };
  function parseTextData(val, tagName, jPath, dontTrim, hasAttributes, isLeafNode, escapeEntities) {
    const options = this.options;
    if (val !== void 0) {
      if (options.trimValues && !dontTrim) {
        val = val.trim();
      }
      if (val.length > 0) {
        if (!escapeEntities) val = this.replaceEntitiesValue(val, tagName, jPath);
        const jPathOrMatcher = options.jPath ? jPath.toString() : jPath;
        const newval = options.tagValueProcessor(tagName, val, jPathOrMatcher, hasAttributes, isLeafNode);
        if (newval === null || newval === void 0) {
          return val;
        } else if (typeof newval !== typeof val || newval !== val) {
          return newval;
        } else if (options.trimValues) {
          return parseValue(val, options.parseTagValue, options.numberParseOptions);
        } else {
          const trimmedVal = val.trim();
          if (trimmedVal === val) {
            return parseValue(val, options.parseTagValue, options.numberParseOptions);
          } else {
            return val;
          }
        }
      }
    }
  }
  function resolveNameSpace(tagname) {
    if (this.options.removeNSPrefix) {
      const tags = tagname.split(":");
      const prefix = tagname.charAt(0) === "/" ? "/" : "";
      if (tags[0] === "xmlns") {
        return "";
      }
      if (tags.length === 2) {
        tagname = prefix + tags[1];
      }
    }
    return tagname;
  }
  var attrsRegx = new RegExp(`([^\\s=]+)\\s*(=\\s*(['"])([\\s\\S]*?)\\3)?`, "gm");
  function buildAttributesMap(attrStr, jPath, tagName, force = false) {
    const options = this.options;
    if (force === true || options.ignoreAttributes !== true && typeof attrStr === "string") {
      const matches = getAllMatches(attrStr, attrsRegx);
      const len = matches.length;
      const attrs = {};
      const processedVals = new Array(len);
      let hasRawAttrs = false;
      const rawAttrsForMatcher = {};
      for (let i = 0; i < len; i++) {
        const attrName = this.resolveNameSpace(matches[i][1]);
        const oldVal = matches[i][4];
        if (attrName.length && oldVal !== void 0) {
          let val = oldVal;
          if (options.trimValues) val = val.trim();
          val = this.replaceEntitiesValue(val, tagName, this.readonlyMatcher);
          processedVals[i] = val;
          rawAttrsForMatcher[attrName] = val;
          hasRawAttrs = true;
        }
      }
      if (hasRawAttrs && typeof jPath === "object" && jPath.updateCurrent) {
        jPath.updateCurrent(rawAttrsForMatcher);
      }
      const jPathStr = options.jPath ? jPath.toString() : this.readonlyMatcher;
      let hasAttrs = false;
      for (let i = 0; i < len; i++) {
        const attrName = this.resolveNameSpace(matches[i][1]);
        if (this.ignoreAttributesFn(attrName, jPathStr)) continue;
        let aName = options.attributeNamePrefix + attrName;
        if (attrName.length) {
          if (options.transformAttributeName) {
            aName = options.transformAttributeName(aName);
          }
          aName = sanitizeName(aName, options);
          if (matches[i][4] !== void 0) {
            const oldVal = processedVals[i];
            const newVal = options.attributeValueProcessor(attrName, oldVal, jPathStr);
            if (newVal === null || newVal === void 0) {
              attrs[aName] = oldVal;
            } else if (typeof newVal !== typeof oldVal || newVal !== oldVal) {
              attrs[aName] = newVal;
            } else {
              attrs[aName] = parseValue(oldVal, options.parseAttributeValue, options.numberParseOptions);
            }
            hasAttrs = true;
          } else if (options.allowBooleanAttributes) {
            attrs[aName] = true;
            hasAttrs = true;
          }
        }
      }
      if (!hasAttrs) return;
      if (options.attributesGroupName && !options.preserveOrder) {
        const attrCollection = {};
        attrCollection[options.attributesGroupName] = attrs;
        return attrCollection;
      }
      return attrs;
    }
  }
  var parseXml = function(xmlData) {
    xmlData = xmlData.replace(/\r\n?/g, "\n");
    const xmlObj = new XmlNode("!xml");
    let currentNode = xmlObj;
    let textData = "";
    this.matcher.reset();
    this.entityDecoder.reset();
    this.entityExpansionCount = 0;
    this.currentExpandedLength = 0;
    this.doctypefound = false;
    const options = this.options;
    const docTypeReader = new DocTypeReader(options.processEntities);
    const xmlLen = xmlData.length;
    for (let i = 0; i < xmlLen; i++) {
      const ch = xmlData[i];
      if (ch === "<") {
        const c1 = xmlData.charCodeAt(i + 1);
        if (c1 === 47) {
          const closeIndex = findClosingIndex(xmlData, ">", i, "Closing Tag is not closed.");
          let tagName = xmlData.substring(i + 2, closeIndex).trim();
          if (options.removeNSPrefix) {
            const colonIndex = tagName.indexOf(":");
            if (colonIndex !== -1) {
              tagName = tagName.substr(colonIndex + 1);
            }
          }
          tagName = transformTagName(options.transformTagName, tagName, "", options).tagName;
          if (currentNode) {
            textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
          }
          const lastTagName = this.matcher.getCurrentTag();
          if (tagName && options.unpairedTagsSet.has(tagName)) {
            throw new Error(`Unpaired tag can not be used as closing tag: </${tagName}>`);
          }
          if (lastTagName && options.unpairedTagsSet.has(lastTagName)) {
            this.matcher.pop();
            this.tagsNodeStack.pop();
          }
          this.matcher.pop();
          this.isCurrentNodeStopNode = false;
          currentNode = this.tagsNodeStack.pop() || xmlObj;
          if (options.captureMetaData && currentNode) {
            currentNode.addEndIndex(closeIndex + 1);
          }
          textData = "";
          i = closeIndex;
        } else if (c1 === 63) {
          let tagData = readTagExp(xmlData, i, false, "?>");
          if (!tagData) throw new Error("Pi Tag is not closed.");
          textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
          const attsMap = this.buildAttributesMap(tagData.tagExp, this.matcher, tagData.tagName, true);
          if (attsMap) {
            const ver = attsMap[this.options.attributeNamePrefix + "version"];
            this.entityDecoder.setXmlVersion(Number(ver) || 1);
            docTypeReader.setXmlVersion(Number(ver) || 1);
          }
          if (options.ignoreDeclaration && tagData.tagName === "?xml" || options.ignorePiTags) {
          } else {
            const childNode = new XmlNode(tagData.tagName);
            childNode.add(options.textNodeName, "");
            if (tagData.tagName !== tagData.tagExp && tagData.attrExpPresent && options.ignoreAttributes !== true) {
              childNode[":@"] = attsMap;
            }
            this.addChild(currentNode, childNode, this.readonlyMatcher, i);
            if (options.captureMetaData) {
              currentNode.addEndIndex(tagData.closeIndex + 2);
            }
          }
          i = tagData.closeIndex + 1;
        } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 45 && xmlData.charCodeAt(i + 3) === 45) {
          const endIndex = findClosingIndex(xmlData, "-->", i + 4, "Comment is not closed.");
          if (options.commentPropName) {
            const comment = xmlData.substring(i + 4, endIndex - 2);
            textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
            currentNode.add(options.commentPropName, [{ [options.textNodeName]: comment }]);
          }
          i = endIndex;
        } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 68) {
          if (this.doctypefound) throw new Error("Multiple DOCTYPE declarations found.");
          this.doctypefound = true;
          const result = docTypeReader.readDocType(xmlData, i);
          this.entityDecoder.addInputEntities(result.entities);
          i = result.i;
        } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 91) {
          const closeIndex = findClosingIndex(xmlData, "]]>", i, "CDATA is not closed.") - 2;
          const tagExp = xmlData.substring(i + 9, closeIndex);
          textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
          let val = this.parseTextData(tagExp, currentNode.tagname, this.readonlyMatcher, true, false, true, true);
          if (val == void 0) val = "";
          if (options.cdataPropName) {
            currentNode.add(options.cdataPropName, [{ [options.textNodeName]: tagExp }]);
          } else {
            currentNode.add(options.textNodeName, val);
          }
          i = closeIndex + 2;
        } else {
          let result = readTagExp(xmlData, i, options.removeNSPrefix);
          if (!result) {
            const context = xmlData.substring(Math.max(0, i - 50), Math.min(xmlLen, i + 50));
            throw new Error(`readTagExp returned undefined at position ${i}. Context: "${context}"`);
          }
          let tagName = result.tagName;
          const rawTagName = result.rawTagName;
          let tagExp = result.tagExp;
          let attrExpPresent = result.attrExpPresent;
          let closeIndex = result.closeIndex;
          ({ tagName, tagExp } = transformTagName(options.transformTagName, tagName, tagExp, options));
          if (options.strictReservedNames && (tagName === options.commentPropName || tagName === options.cdataPropName || tagName === options.textNodeName || tagName === options.attributesGroupName)) {
            throw new Error(`Invalid tag name: ${tagName}`);
          }
          if (currentNode && textData) {
            if (currentNode.tagname !== "!xml") {
              textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher, false);
            }
          }
          const lastTag = currentNode;
          if (lastTag && options.unpairedTagsSet.has(lastTag.tagname)) {
            currentNode = this.tagsNodeStack.pop();
            this.matcher.pop();
          }
          let isSelfClosing = false;
          if (tagExp.length > 0 && tagExp.lastIndexOf("/") === tagExp.length - 1) {
            isSelfClosing = true;
            if (tagName[tagName.length - 1] === "/") {
              tagName = tagName.substr(0, tagName.length - 1);
              tagExp = tagName;
            } else {
              tagExp = tagExp.substr(0, tagExp.length - 1);
            }
            attrExpPresent = tagName !== tagExp;
          }
          let prefixedAttrs = null;
          let rawAttrs = {};
          let namespace = void 0;
          namespace = extractNamespace(rawTagName);
          if (tagName !== xmlObj.tagname) {
            this.matcher.push(tagName, {}, namespace);
          }
          if (tagName !== tagExp && attrExpPresent) {
            prefixedAttrs = this.buildAttributesMap(tagExp, this.matcher, tagName);
            if (prefixedAttrs) {
              rawAttrs = extractRawAttributes(prefixedAttrs, options);
            }
          }
          if (tagName !== xmlObj.tagname) {
            this.isCurrentNodeStopNode = this.isItStopNode();
          }
          const startIndex = i;
          if (this.isCurrentNodeStopNode) {
            let tagContent = "";
            if (isSelfClosing) {
              i = result.closeIndex;
            } else if (options.unpairedTagsSet.has(tagName)) {
              i = result.closeIndex;
            } else {
              const result2 = this.readStopNodeData(xmlData, rawTagName, closeIndex + 1);
              if (!result2) throw new Error(`Unexpected end of ${rawTagName}`);
              i = result2.i;
              tagContent = result2.tagContent;
            }
            const childNode = new XmlNode(tagName);
            if (prefixedAttrs) {
              childNode[":@"] = prefixedAttrs;
            }
            childNode.add(options.textNodeName, tagContent);
            this.matcher.pop();
            this.isCurrentNodeStopNode = false;
            this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
            if (options.captureMetaData) {
              currentNode.addEndIndex(i + 1);
            }
          } else {
            if (isSelfClosing) {
              ({ tagName, tagExp } = transformTagName(options.transformTagName, tagName, tagExp, options));
              const childNode = new XmlNode(tagName);
              if (prefixedAttrs) {
                childNode[":@"] = prefixedAttrs;
              }
              this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
              if (options.captureMetaData) {
                currentNode.addEndIndex(closeIndex + 1);
              }
              this.matcher.pop();
              this.isCurrentNodeStopNode = false;
            } else if (options.unpairedTagsSet.has(tagName)) {
              const childNode = new XmlNode(tagName);
              if (prefixedAttrs) {
                childNode[":@"] = prefixedAttrs;
              }
              this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
              if (options.captureMetaData) {
                currentNode.addEndIndex(result.closeIndex + 1);
              }
              this.matcher.pop();
              this.isCurrentNodeStopNode = false;
              i = result.closeIndex;
              continue;
            } else {
              const childNode = new XmlNode(tagName);
              if (this.tagsNodeStack.length > options.maxNestedTags) {
                throw new Error("Maximum nested tags exceeded");
              }
              this.tagsNodeStack.push(currentNode);
              if (prefixedAttrs) {
                childNode[":@"] = prefixedAttrs;
              }
              this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
              currentNode = childNode;
            }
            textData = "";
            i = closeIndex;
          }
        }
      } else {
        textData += xmlData[i];
      }
    }
    return xmlObj.child;
  };
  function addChild(currentNode, childNode, matcher, startIndex) {
    if (!this.options.captureMetaData) startIndex = void 0;
    const jPathOrMatcher = this.options.jPath ? matcher.toString() : matcher;
    const result = this.options.updateTag(childNode.tagname, jPathOrMatcher, childNode[":@"]);
    if (result === false) {
    } else if (typeof result === "string") {
      childNode.tagname = result;
      currentNode.addChild(childNode, startIndex);
    } else {
      currentNode.addChild(childNode, startIndex);
    }
  }
  function replaceEntitiesValue(val, tagName, jPath) {
    const entityConfig = this.options.processEntities;
    if (!entityConfig || !entityConfig.enabled) {
      return val;
    }
    if (entityConfig.allowedTags) {
      const jPathOrMatcher = this.options.jPath ? jPath.toString() : jPath;
      const allowed = Array.isArray(entityConfig.allowedTags) ? entityConfig.allowedTags.includes(tagName) : entityConfig.allowedTags(tagName, jPathOrMatcher);
      if (!allowed) {
        return val;
      }
    }
    if (entityConfig.tagFilter) {
      const jPathOrMatcher = this.options.jPath ? jPath.toString() : jPath;
      if (!entityConfig.tagFilter(tagName, jPathOrMatcher)) {
        return val;
      }
    }
    return this.entityDecoder.decode(val);
  }
  function saveTextToParentTag(textData, parentNode, matcher, isLeafNode) {
    if (textData) {
      if (isLeafNode === void 0) isLeafNode = parentNode.child.length === 0;
      textData = this.parseTextData(
        textData,
        parentNode.tagname,
        matcher,
        false,
        parentNode[":@"] ? Object.keys(parentNode[":@"]).length !== 0 : false,
        isLeafNode
      );
      if (textData !== void 0 && textData !== "")
        parentNode.add(this.options.textNodeName, textData);
      textData = "";
    }
    return textData;
  }
  function isItStopNode() {
    if (this.stopNodeExpressionsSet.size === 0) return false;
    return this.matcher.matchesAny(this.stopNodeExpressionsSet);
  }
  function tagExpWithClosingIndex(xmlData, i, closingChar = ">") {
    let attrBoundary = 0;
    const len = xmlData.length;
    const closeCode0 = closingChar.charCodeAt(0);
    const closeCode1 = closingChar.length > 1 ? closingChar.charCodeAt(1) : -1;
    let result = "";
    let segmentStart = i;
    for (let index = i; index < len; index++) {
      const code = xmlData.charCodeAt(index);
      if (attrBoundary) {
        if (code === attrBoundary) attrBoundary = 0;
      } else if (code === 34 || code === 39) {
        attrBoundary = code;
      } else if (code === closeCode0) {
        if (closeCode1 !== -1) {
          if (xmlData.charCodeAt(index + 1) === closeCode1) {
            result += xmlData.substring(segmentStart, index);
            return { data: result, index };
          }
        } else {
          result += xmlData.substring(segmentStart, index);
          return { data: result, index };
        }
      } else if (code === 9 && !attrBoundary) {
        result += xmlData.substring(segmentStart, index) + " ";
        segmentStart = index + 1;
      }
    }
  }
  function findClosingIndex(xmlData, str, i, errMsg) {
    const closingIndex = xmlData.indexOf(str, i);
    if (closingIndex === -1) {
      throw new Error(errMsg);
    } else {
      return closingIndex + str.length - 1;
    }
  }
  function findClosingChar(xmlData, char, i, errMsg) {
    const closingIndex = xmlData.indexOf(char, i);
    if (closingIndex === -1) throw new Error(errMsg);
    return closingIndex;
  }
  function readTagExp(xmlData, i, removeNSPrefix, closingChar = ">") {
    const result = tagExpWithClosingIndex(xmlData, i + 1, closingChar);
    if (!result) return;
    let tagExp = result.data;
    const closeIndex = result.index;
    const separatorIndex = tagExp.search(/\s/);
    let tagName = tagExp;
    let attrExpPresent = true;
    if (separatorIndex !== -1) {
      tagName = tagExp.substring(0, separatorIndex);
      tagExp = tagExp.substring(separatorIndex + 1).trimStart();
    }
    const rawTagName = tagName;
    if (removeNSPrefix) {
      const colonIndex = tagName.indexOf(":");
      if (colonIndex !== -1) {
        tagName = tagName.substr(colonIndex + 1);
        attrExpPresent = tagName !== result.data.substr(colonIndex + 1);
      }
    }
    return {
      tagName,
      tagExp,
      closeIndex,
      attrExpPresent,
      rawTagName
    };
  }
  function readStopNodeData(xmlData, tagName, i) {
    const startIndex = i;
    let openTagCount = 1;
    const xmllen = xmlData.length;
    for (; i < xmllen; i++) {
      if (xmlData[i] === "<") {
        const c1 = xmlData.charCodeAt(i + 1);
        if (c1 === 47) {
          const closeIndex = findClosingChar(xmlData, ">", i, `${tagName} is not closed`);
          let closeTagName = xmlData.substring(i + 2, closeIndex).trim();
          if (closeTagName === tagName) {
            openTagCount--;
            if (openTagCount === 0) {
              return {
                tagContent: xmlData.substring(startIndex, i),
                i: closeIndex
              };
            }
          }
          i = closeIndex;
        } else if (c1 === 63) {
          const closeIndex = findClosingIndex(xmlData, "?>", i + 1, "StopNode is not closed.");
          i = closeIndex;
        } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 45 && xmlData.charCodeAt(i + 3) === 45) {
          const closeIndex = findClosingIndex(xmlData, "-->", i + 3, "StopNode is not closed.");
          i = closeIndex;
        } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 91) {
          const closeIndex = findClosingIndex(xmlData, "]]>", i, "StopNode is not closed.") - 2;
          i = closeIndex;
        } else {
          const tagData = readTagExp(xmlData, i, false);
          if (tagData) {
            const openTagName = tagData && tagData.tagName;
            if (openTagName === tagName && tagData.tagExp[tagData.tagExp.length - 1] !== "/") {
              openTagCount++;
            }
            i = tagData.closeIndex;
          }
        }
      }
    }
  }
  function parseValue(val, shouldParse, options) {
    if (shouldParse && typeof val === "string") {
      const newval = val.trim();
      if (newval === "true") return true;
      else if (newval === "false") return false;
      else return toNumber(val, options);
    } else {
      if (isExist(val)) {
        return val;
      } else {
        return "";
      }
    }
  }
  function transformTagName(fn, tagName, tagExp, options) {
    if (fn) {
      const newTagName = fn(tagName);
      if (tagExp === tagName) {
        tagExp = newTagName;
      }
      tagName = newTagName;
    }
    tagName = sanitizeName(tagName, options);
    return { tagName, tagExp };
  }
  function sanitizeName(name, options) {
    if (criticalProperties.includes(name)) {
      throw new Error(`[SECURITY] Invalid name: "${name}" is a reserved JavaScript keyword that could cause prototype pollution`);
    } else if (DANGEROUS_PROPERTY_NAMES.includes(name)) {
      return options.onDangerousProperty(name);
    }
    return name;
  }

  // node_modules/fast-xml-parser/src/xmlparser/node2json.js
  var METADATA_SYMBOL2 = XmlNode.getMetaDataSymbol();
  function stripAttributePrefix(attrs, prefix) {
    if (!attrs || typeof attrs !== "object") return {};
    if (!prefix) return attrs;
    const rawAttrs = {};
    for (const key in attrs) {
      if (key.startsWith(prefix)) {
        const rawName = key.substring(prefix.length);
        rawAttrs[rawName] = attrs[key];
      } else {
        rawAttrs[key] = attrs[key];
      }
    }
    return rawAttrs;
  }
  function prettify(node, options, matcher, readonlyMatcher) {
    return compress(node, options, matcher, readonlyMatcher);
  }
  function compress(arr, options, matcher, readonlyMatcher) {
    let text;
    const compressedObj = {};
    for (let i = 0; i < arr.length; i++) {
      const tagObj = arr[i];
      const property = propName(tagObj);
      if (property !== void 0 && property !== options.textNodeName) {
        const rawAttrs = stripAttributePrefix(
          tagObj[":@"] || {},
          options.attributeNamePrefix
        );
        matcher.push(property, rawAttrs);
      }
      if (property === options.textNodeName) {
        if (text === void 0) text = tagObj[property];
        else text += "" + tagObj[property];
      } else if (property === void 0) {
        continue;
      } else if (tagObj[property]) {
        let val = compress(tagObj[property], options, matcher, readonlyMatcher);
        const isLeaf = isLeafTag(val, options);
        if (Object.keys(val).length === 0 && options.alwaysCreateTextNode) {
          val[options.textNodeName] = "";
        }
        if (tagObj[":@"]) {
          assignAttributes(val, tagObj[":@"], readonlyMatcher, options);
        } else if (Object.keys(val).length === 1 && val[options.textNodeName] !== void 0 && !options.alwaysCreateTextNode) {
          val = val[options.textNodeName];
        } else if (Object.keys(val).length === 0) {
          if (options.alwaysCreateTextNode) val[options.textNodeName] = "";
          else val = "";
        }
        if (tagObj[METADATA_SYMBOL2] !== void 0 && typeof val === "object" && val !== null) {
          val[METADATA_SYMBOL2] = tagObj[METADATA_SYMBOL2];
        }
        if (compressedObj[property] !== void 0 && Object.prototype.hasOwnProperty.call(compressedObj, property)) {
          if (!Array.isArray(compressedObj[property])) {
            compressedObj[property] = [compressedObj[property]];
          }
          compressedObj[property].push(val);
        } else {
          const jPathOrMatcher = options.jPath ? readonlyMatcher.toString() : readonlyMatcher;
          if (options.isArray(property, jPathOrMatcher, isLeaf)) {
            compressedObj[property] = [val];
          } else {
            compressedObj[property] = val;
          }
        }
        if (property !== void 0 && property !== options.textNodeName) {
          matcher.pop();
        }
      }
    }
    if (typeof text === "string") {
      if (text.length > 0) compressedObj[options.textNodeName] = text;
    } else if (text !== void 0) compressedObj[options.textNodeName] = text;
    return compressedObj;
  }
  function propName(obj) {
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key !== ":@") return key;
    }
  }
  function assignAttributes(obj, attrMap, readonlyMatcher, options) {
    if (attrMap) {
      const keys = Object.keys(attrMap);
      const len = keys.length;
      for (let i = 0; i < len; i++) {
        const atrrName = keys[i];
        const rawAttrName = atrrName.startsWith(options.attributeNamePrefix) ? atrrName.substring(options.attributeNamePrefix.length) : atrrName;
        const jPathOrMatcher = options.jPath ? readonlyMatcher.toString() + "." + rawAttrName : readonlyMatcher;
        if (options.isArray(atrrName, jPathOrMatcher, true, true)) {
          obj[atrrName] = [attrMap[atrrName]];
        } else {
          obj[atrrName] = attrMap[atrrName];
        }
      }
    }
  }
  function isLeafTag(obj, options) {
    const { textNodeName } = options;
    const propCount = Object.keys(obj).length;
    if (propCount === 0) {
      return true;
    }
    if (propCount === 1 && (obj[textNodeName] || typeof obj[textNodeName] === "boolean" || obj[textNodeName] === 0)) {
      return true;
    }
    return false;
  }

  // node_modules/fast-xml-parser/src/xmlparser/XMLParser.js
  var XMLParser = class {
    constructor(options) {
      this.externalEntities = {};
      this.options = buildOptions(options);
    }
    /**
     * Parse XML dats to JS object 
     * @param {string|Uint8Array} xmlData 
     * @param {boolean|Object} validationOption 
     */
    parse(xmlData, validationOption) {
      if (typeof xmlData !== "string" && xmlData.toString) {
        xmlData = xmlData.toString();
      } else if (typeof xmlData !== "string") {
        throw new Error("XML data is accepted in String or Bytes[] form.");
      }
      if (validationOption) {
        if (validationOption === true) validationOption = {};
        const result = validate(xmlData, validationOption);
        if (result !== true) {
          throw Error(`${result.err.msg}:${result.err.line}:${result.err.col}`);
        }
      }
      const orderedObjParser = new OrderedObjParser(this.options, this.externalEntities);
      const orderedResult = orderedObjParser.parseXml(xmlData);
      if (this.options.preserveOrder || orderedResult === void 0) return orderedResult;
      else return prettify(orderedResult, this.options, orderedObjParser.matcher, orderedObjParser.readonlyMatcher);
    }
    /**
     * Add Entity which is not by default supported by this library
     * @param {string} key 
     * @param {string} value 
     */
    addEntity(key, value) {
      if (value.indexOf("&") !== -1) {
        throw new Error("Entity value can't have '&'");
      } else if (key.indexOf("&") !== -1 || key.indexOf(";") !== -1) {
        throw new Error("An entity must be set without '&' and ';'. Eg. use '#xD' for '&#xD;'");
      } else if (value === "&") {
        throw new Error("An entity with value '&' is not permitted");
      } else {
        this.externalEntities[key] = value;
      }
    }
    /**
     * Returns a Symbol that can be used to access the metadata
     * property on a node.
     * 
     * If Symbol is not available in the environment, an ordinary property is used
     * and the name of the property is here returned.
     * 
     * The XMLMetaData property is only present when `captureMetaData`
     * is true in the options.
     */
    static getMetaDataSymbol() {
      return XmlNode.getMetaDataSymbol();
    }
  };

  // ../genoffice/packages/pptx-engine/src/xml-utils.ts
  function asXmlNode(v) {
    return typeof v === "object" && v !== null ? v : {};
  }
  function xmlArray(v) {
    if (Array.isArray(v)) return v.map(asXmlNode);
    return v ? [asXmlNode(v)] : [];
  }
  function decodeNumericCharRefs(text) {
    return text.replace(/&#(?:x([0-9a-fA-F]+)|(\d+));/g, (reference, hex, decimal) => {
      const code = hex === void 0 ? Number(decimal) : Number.parseInt(hex, 16);
      return code <= 1114111 && (code < 55296 || code > 57343) ? String.fromCodePoint(code) : reference;
    });
  }

  // ../genoffice/packages/pptx-engine/src/zip.ts
  var Buffer3 = Buffer2;
  var relsParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    isArray: (name) => name === "Relationship" || name === "sldId" || name === "Override"
  });
  var PPTX_ZIP_LIMITS = {
    maxParts: 1e4,
    maxPartBytes: 512 * 1024 * 1024,
    maxTotalBytes: 1.5 * 1024 * 1024 * 1024
  };
  function assertZipWithinLimits(zip) {
    const files = Object.values(zip.files).filter((f) => !f.dir);
    if (files.length > PPTX_ZIP_LIMITS.maxParts) {
      throw new Error(
        `pptx rejected: ${files.length} parts exceeds the ${PPTX_ZIP_LIMITS.maxParts} limit`
      );
    }
    let total = 0;
    for (const file of files) {
      const size = file._data?.uncompressedSize ?? 0;
      if (size > PPTX_ZIP_LIMITS.maxPartBytes) {
        throw new Error(
          `pptx rejected: part ${file.name} declares ${size} uncompressed bytes (limit ${PPTX_ZIP_LIMITS.maxPartBytes})`
        );
      }
      if (size > 0) total += size;
    }
    if (total > PPTX_ZIP_LIMITS.maxTotalBytes) {
      throw new Error(
        `pptx rejected: total uncompressed size ${total} exceeds the ${PPTX_ZIP_LIMITS.maxTotalBytes} limit`
      );
    }
  }
  var PackageArchive = class _PackageArchive {
    constructor(zip, entries, originalHash) {
      this.zip = zip;
      this.entries = entries;
      this.originalHash = originalHash;
    }
    static async open(bytes) {
      const originalHash = createHash("sha256").update(bytes).digest("hex");
      const zip = await import_jszip.default.loadAsync(bytes);
      assertZipWithinLimits(zip);
      const entries = /* @__PURE__ */ new Map();
      const names = Object.keys(zip.files);
      for (const name of names) {
        const file = zip.files[name];
        if (file.dir) continue;
        entries.set(name, await file.async("uint8array"));
      }
      return new _PackageArchive(zip, entries, originalHash);
    }
    has(path) {
      return this.entries.has(path);
    }
    /** Read a part as a UTF-8 string (for XML parts). */
    readText(path) {
      const bytes = this.entries.get(path);
      if (!bytes) return null;
      return Buffer3.from(bytes).toString("utf8");
    }
    readBytes(path) {
      return this.entries.get(path) ?? null;
    }
    /**
     * Read a part's relationships file. partPath e.g. 'ppt/slides/slide1.xml' →
     * 'ppt/slides/_rels/slide1.xml.rels'.
     */
    readRels(partPath) {
      const relsPath = relsPathFor(partPath);
      const rels = /* @__PURE__ */ new Map();
      const xml = this.readText(relsPath);
      if (!xml) return rels;
      const doc = asXmlNode(relsParser.parse(xml));
      const list = asXmlNode(doc.Relationships).Relationship;
      for (const r of xmlArray(list)) {
        const id = String(r["@_Id"] ?? "");
        rels.set(id, {
          id,
          type: String(r["@_Type"] ?? ""),
          target: String(r["@_Target"] ?? ""),
          ...r["@_TargetMode"] != null ? { targetMode: String(r["@_TargetMode"]) } : {}
        });
      }
      return rels;
    }
    /**
     * Read the presentation's slide size and the slide part paths in order.
     */
    readPresentation() {
      const presXml = this.readText("ppt/presentation.xml");
      if (!presXml) throw new Error("pptx: missing ppt/presentation.xml");
      const parser3 = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        isArray: (name) => name === "p:sldId"
      });
      const pres = asXmlNode(parser3.parse(presXml));
      const rootRaw = pres["p:presentation"] ?? pres.presentation;
      if (!rootRaw) throw new Error("pptx: malformed presentation.xml");
      const root = asXmlNode(rootRaw);
      const szRaw = root["p:sldSz"] ?? root.sldSz;
      const sz = szRaw ? asXmlNode(szRaw) : null;
      const emuOr = (raw, fallback) => {
        const parsed = parseInt(String(raw), 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
      };
      const size = {
        cx: sz ? emuOr(sz["@_cx"], 9144e3) : 9144e3,
        cy: sz ? emuOr(sz["@_cy"], 6858e3) : 6858e3
      };
      const rels = this.readRels("ppt/presentation.xml");
      const sldIdLst = asXmlNode(root["p:sldIdLst"] ?? root.sldIdLst);
      const slidePaths = [];
      for (const id of xmlArray(sldIdLst["p:sldId"])) {
        const rId = id["@_r:id"] ?? id["@_id"];
        if (!rId) continue;
        const rel = rels.get(String(rId));
        if (!rel) continue;
        slidePaths.push(resolveTarget("ppt/presentation.xml", rel.target));
      }
      return { size, slidePaths };
    }
    /** Resolve a slide's layout / master part paths (via the rels chain). */
    resolveSlideChain(slidePath) {
      const slideRels = this.readRels(slidePath);
      let layoutPath;
      for (const rel of slideRels.values()) {
        if (rel.type.endsWith("/slideLayout")) {
          layoutPath = resolveTarget(slidePath, rel.target);
          break;
        }
      }
      if (!layoutPath) layoutPath = this.fallbackLayoutPath(slidePath);
      let masterPath;
      let themePath;
      if (layoutPath) {
        const layoutRels = this.readRels(layoutPath);
        for (const rel of layoutRels.values()) {
          if (rel.type.endsWith("/slideMaster")) {
            masterPath = resolveTarget(layoutPath, rel.target);
            break;
          }
        }
      }
      if (masterPath) {
        const masterRels = this.readRels(masterPath);
        for (const rel of masterRels.values()) {
          if (rel.type.endsWith("/theme")) {
            themePath = resolveTarget(masterPath, rel.target);
            break;
          }
        }
      }
      return { layoutPath, masterPath, themePath };
    }
    /**
     * Layout for a slide that lost its slideLayout relationship: the first master's layouts in
     * sldLayoutIdLst order, preferring the title layout for a slide carrying a ctrTitle placeholder
     * (what the deck's own title page would have referenced), else the first layout.
     */
    fallbackLayoutPath(slidePath) {
      const presXml = this.readText("ppt/presentation.xml");
      if (!presXml) return void 0;
      const presRels = this.readRels("ppt/presentation.xml");
      const masterRid = /<p:sldMasterId\b[^>]*\br:id="([^"]+)"/.exec(presXml)?.[1];
      const masterRel = masterRid ? presRels.get(masterRid) : [...presRels.values()].find((r) => r.type.endsWith("/slideMaster"));
      if (!masterRel) return void 0;
      const masterPath = resolveTarget("ppt/presentation.xml", masterRel.target);
      const masterXml = this.readText(masterPath);
      if (!masterXml) return void 0;
      const masterRels = this.readRels(masterPath);
      const layouts = [];
      for (const m of masterXml.matchAll(/<p:sldLayoutId\b[^>]*\br:id="([^"]+)"/g)) {
        const rel = masterRels.get(m[1]);
        if (rel) layouts.push(resolveTarget(masterPath, rel.target));
      }
      if (!layouts.length) {
        for (const rel of masterRels.values())
          if (rel.type.endsWith("/slideLayout")) layouts.push(resolveTarget(masterPath, rel.target));
      }
      if (!layouts.length) return void 0;
      const wantsTitle = /<p:ph\b[^>]*\btype="ctrTitle"/.test(this.readText(slidePath) ?? "");
      if (wantsTitle) {
        const title = layouts.find(
          (p) => /<p:sldLayout\b[^>]*\btype="title"/.test(this.readText(p) ?? "")
        );
        if (title) return title;
      }
      return layouts[0];
    }
  };
  function relsPathFor(partPath) {
    const idx = partPath.lastIndexOf("/");
    const dir = idx >= 0 ? partPath.slice(0, idx) : "";
    const file = idx >= 0 ? partPath.slice(idx + 1) : partPath;
    return `${dir ? dir + "/" : ""}_rels/${file}.rels`;
  }
  function resolveTarget(basePart, target) {
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(target)) return "";
    let decoded;
    try {
      decoded = decodeURIComponent(target);
    } catch {
      return "";
    }
    const baseSlash = basePart.lastIndexOf("/");
    const parts = decoded.startsWith("/") ? [] : (baseSlash >= 0 ? basePart.slice(0, baseSlash) : "").split("/").filter(Boolean);
    for (const seg of decoded.replace(/\\/g, "/").split("/")) {
      if (seg === "." || seg === "") continue;
      if (seg === "..") parts.pop();
      else parts.push(seg);
    }
    return parts.join("/");
  }

  // ../genoffice/packages/pptx-engine/src/theme.ts
  var parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  function topLevelFragments(xml) {
    const out = [];
    const re = /<(\/?)([a-zA-Z][\w:]*)((?:"[^"]*"|'[^']*'|[^"'>])*?)(\/?)>/g;
    let depth = 0;
    let curStart = -1;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const closing = m[1] === "/";
      const selfClose = m[4] === "/";
      if (!closing && !selfClose) {
        if (depth === 0) curStart = m.index;
        depth++;
      } else if (closing) {
        depth--;
        if (depth === 0 && curStart >= 0) out.push(xml.slice(curStart, re.lastIndex));
      } else if (selfClose && depth === 0) {
        out.push(xml.slice(m.index, re.lastIndex));
      }
    }
    return out;
  }
  function parseStyleList(themeXml, tag) {
    const m = new RegExp(`<a:${tag}\\b[^>]*>([\\s\\S]*?)</a:${tag}>`).exec(themeXml);
    if (!m) return void 0;
    const items = topLevelFragments(m[1]).map((frag) => asXmlNode(parser.parse(frag)));
    return items.length ? items : void 0;
  }
  function readColorNode(node) {
    if (!node) return void 0;
    const n = asXmlNode(node);
    const srgb = asXmlNode(n["a:srgbClr"]);
    if (n["a:srgbClr"]) return "#" + String(srgb["@_val"]).toUpperCase();
    const sys = asXmlNode(n["a:sysClr"]);
    if (n["a:sysClr"]) return sysColorHex(sys["@_val"], sys["@_lastClr"]);
    return void 0;
  }
  function sysColorHex(val, lastClr) {
    if (val === "window") return "#FFFFFF";
    if (val === "windowText") return "#000000";
    return "#" + String(lastClr ?? "000000").toUpperCase();
  }
  function typeface(scheme, font, script) {
    const v = asXmlNode(asXmlNode(scheme[font])[script])["@_typeface"];
    return typeof v === "string" && v ? v : void 0;
  }
  function scriptFonts(scheme, font) {
    const out = {};
    for (const f of xmlArray(asXmlNode(scheme[font])["a:font"])) {
      const n = asXmlNode(f);
      const script = n["@_script"];
      const face = n["@_typeface"];
      if (typeof script === "string" && typeof face === "string" && face) out[script] = face;
    }
    return Object.keys(out).length ? out : void 0;
  }
  function parseTheme(themeXml) {
    const doc = asXmlNode(parser.parse(themeXml));
    const themeEl = asXmlNode(doc["a:theme"] ?? doc.theme);
    const elements = asXmlNode(themeEl["a:themeElements"]);
    const clrScheme = asXmlNode(elements["a:clrScheme"]);
    const colors = {};
    for (const key of [
      "dk1",
      "lt1",
      "dk2",
      "lt2",
      "accent1",
      "accent2",
      "accent3",
      "accent4",
      "accent5",
      "accent6",
      "hlink",
      "folHlink"
    ]) {
      const c = readColorNode(clrScheme["a:" + key]);
      if (c) colors[key] = c;
    }
    const fontScheme = asXmlNode(elements["a:fontScheme"]);
    const majorFont = typeface(fontScheme, "a:majorFont", "a:latin");
    const minorFont = typeface(fontScheme, "a:minorFont", "a:latin");
    const majorEaFont = typeface(fontScheme, "a:majorFont", "a:ea");
    const minorEaFont = typeface(fontScheme, "a:minorFont", "a:ea");
    const majorCsFont = typeface(fontScheme, "a:majorFont", "a:cs");
    const minorCsFont = typeface(fontScheme, "a:minorFont", "a:cs");
    const majorScriptFonts = scriptFonts(fontScheme, "a:majorFont");
    const minorScriptFonts = scriptFonts(fontScheme, "a:minorFont");
    const fmtM = /<a:fmtScheme\b[^>]*>[\s\S]*?<\/a:fmtScheme>/.exec(themeXml);
    const fmt = fmtM?.[0] ?? "";
    const fillStyles2 = parseStyleList(fmt, "fillStyleLst");
    const lnStyles2 = parseStyleList(fmt, "lnStyleLst");
    const effectStyles2 = parseStyleList(fmt, "effectStyleLst");
    const bgFillStyles2 = parseStyleList(fmt, "bgFillStyleLst");
    return {
      colors,
      majorFont,
      minorFont,
      majorEaFont,
      minorEaFont,
      majorCsFont,
      minorCsFont,
      ...majorScriptFonts ? { majorScriptFonts } : {},
      ...minorScriptFonts ? { minorScriptFonts } : {},
      ...fillStyles2 ? { fillStyles: fillStyles2 } : {},
      ...lnStyles2 ? { lnStyles: lnStyles2 } : {},
      ...effectStyles2 ? { effectStyles: effectStyles2 } : {},
      ...bgFillStyles2 ? { bgFillStyles: bgFillStyles2 } : {}
    };
  }
  function themeWithOverride(base, overrideXml) {
    const inner = /<a:themeOverride\b[^>]*>([\s\S]*)<\/a:themeOverride>/.exec(overrideXml)?.[1];
    if (!inner) return base ?? { colors: {} };
    const parsed = parseTheme(`<a:theme><a:themeElements>${inner}</a:themeElements></a:theme>`);
    const merged = { ...base, colors: { ...base?.colors, ...parsed.colors } };
    for (const [k, v] of Object.entries(parsed)) {
      if (k !== "colors" && k !== "clrMap" && v !== void 0) {
        ;
        merged[k] = v;
      }
    }
    return merged;
  }
  var EA_SCRIPT_TAG = {
    ja: "Jpan",
    ko: "Hang",
    sc: "Hans",
    tc: "Hant"
  };
  var HAN_SCRIPT_TAGS = ["Jpan", "Hans", "Hant"];
  function eaScriptOfLang(tag) {
    const t = String(tag ?? "").toLowerCase();
    if (t.startsWith("ja")) return "ja";
    if (t.startsWith("ko")) return "ko";
    if (/^zh(-(tw|hk|mo|hant))/.test(t)) return "tc";
    if (t.startsWith("zh")) return "sc";
    return void 0;
  }
  function resolveFontRef(typeface2, theme, eaScript) {
    if (!typeface2) return void 0;
    if (!typeface2.startsWith("+")) return typeface2;
    const scriptFont = (fonts) => {
      if (!eaScript || !fonts) return void 0;
      if (eaScript !== "han") return fonts[EA_SCRIPT_TAG[eaScript]];
      const han = HAN_SCRIPT_TAGS.filter((t) => fonts[t]);
      return han.length === 1 ? fonts[han[0]] : void 0;
    };
    switch (typeface2) {
      case "+mj-lt":
        return theme?.majorFont;
      case "+mn-lt":
        return theme?.minorFont;
      case "+mj-ea":
        return theme?.majorEaFont ?? scriptFont(theme?.majorScriptFonts) ?? theme?.majorFont;
      case "+mn-ea":
        return theme?.minorEaFont ?? scriptFont(theme?.minorScriptFonts) ?? theme?.minorFont;
      case "+mj-cs":
        return theme?.majorCsFont ?? theme?.majorFont;
      case "+mn-cs":
        return theme?.minorCsFont ?? theme?.minorFont;
      default:
        return theme?.minorFont;
    }
  }
  function resolveSchemeColor(name, theme, phClr) {
    if (name === "phClr") return phClr;
    const standard = { tx1: "dk1", bg1: "lt1", tx2: "dk2", bg2: "lt2" };
    const key = theme?.clrMap?.[name] ?? standard[name] ?? name;
    return theme?.colors[key];
  }
  var CLR_MAP_NAMES = [
    "bg1",
    "tx1",
    "bg2",
    "tx2",
    "accent1",
    "accent2",
    "accent3",
    "accent4",
    "accent5",
    "accent6",
    "hlink",
    "folHlink"
  ];
  function clrMapFromTag(tag) {
    const out = {};
    for (const name of CLR_MAP_NAMES) {
      const m = new RegExp(`\\b${name}="([^"]+)"`).exec(tag);
      if (m) out[name] = m[1];
    }
    return Object.keys(out).length ? out : void 0;
  }
  function parseClrMap(masterXml, layoutXml, slideXml) {
    for (const xml of [slideXml, layoutXml]) {
      const tag2 = xml ? /<a:overrideClrMapping\b[^>]*\/?>/.exec(xml)?.[0] : void 0;
      const map = tag2 ? clrMapFromTag(tag2) : void 0;
      if (map) return map;
    }
    const tag = masterXml ? /<p:clrMap\b[^>]*\/?>/.exec(masterXml)?.[0] : void 0;
    return tag ? clrMapFromTag(tag) : void 0;
  }

  // ../genoffice/packages/pptx-engine/src/named-action.ts
  var SHOWJUMP_ACTION = "ppaction://hlinkshowjump?jump=";
  var NAMED_ACTIONS = [
    "nextslide",
    "previousslide",
    "firstslide",
    "lastslide",
    "lastslideviewed",
    "endshow"
  ];
  function namedActionOf(action) {
    if (!action || !action.startsWith(SHOWJUMP_ACTION)) return null;
    const name = action.slice(SHOWJUMP_ACTION.length);
    return NAMED_ACTIONS.includes(name) ? name : null;
  }

  // ../genoffice/packages/pptx-engine/src/dgm-hier.ts
  var DEFAULTS = {
    boxAspect: 0.5,
    sibSp: 0.21,
    sp: 0.21,
    trunkOff: 0.1,
    hangIndent: 0.25,
    fontMax: 65
  };
  function parseHierConstraints(layoutXml) {
    const cons = { ...DEFAULTS };
    if (!layoutXml) return cons;
    const fact = (re) => {
      const m = re.exec(layoutXml);
      if (!m) return void 0;
      const v = parseFloat(m[1]);
      return Number.isFinite(v) && v > 0 ? v : void 0;
    };
    cons.boxAspect = fact(
      /<dgm:constr type="h" for="des" forName="rootComposite1?"[^>]*refForName="rootComposite1?"[^>]*fact="([\d.]+)"/
    ) ?? cons.boxAspect;
    cons.sibSp = fact(/<dgm:constr type="sibSp"[^>]*refForName="rootComposite1?"[^>]*fact="([\d.]+)"/) ?? cons.sibSp;
    cons.sp = fact(/<dgm:constr type="sp" for="des" forName="hierRoot1"[^>]*fact="([\d.]+)"/) ?? cons.sp;
    const connW = fact(/<dgm:constr type="w" for="ch" forName="rootConnector1?"[^>]*fact="([\d.]+)"/);
    if (connW != null) cons.trunkOff = connW / 2;
    const fsz = /<dgm:constr type="primFontSz"[^>]*\bval="([\d.]+)"/.exec(layoutXml);
    if (fsz) cons.fontMax = parseFloat(fsz[1]) || cons.fontMax;
    return cons;
  }
  var isLeafAsst = (c) => !!c.asst && !c.children.length;
  var kidsOf = (n) => n.children.filter((c) => !isLeafAsst(c));
  var asstsOf = (n) => n.children.filter(isLeafAsst);
  function stdRowsOf(node) {
    const kids = kidsOf(node);
    const asstRows = asstsOf(node).length ? 1 : 0;
    if (!kids.length) return 1 + asstRows;
    let deepest = 0;
    for (const kid of kids) {
      const rows = stdRowsOf(kid);
      if (rows > deepest) deepest = rows;
    }
    return 1 + asstRows + deepest;
  }
  function branchOf(node, depth, kids, stdRows) {
    if (!kids.length) return "std";
    const allLeaves = node.children.every((c) => !c.children.length);
    const hb = node.hierBranch;
    if (hb === "l") return "hangL";
    if (hb === "r" || hb === "hang") return "hangR";
    if (hb === "std") return "std";
    return stdRows >= 4 && depth >= 2 && kids.length >= 2 && allLeaves ? "hangR" : "std";
  }
  function shiftSub(sub, dx, dRow, into, dy) {
    for (let i = 0; i < sub.rows; i++) {
      const row = dRow + i;
      const sl = sub.l[i] + dx;
      const sr = sub.r[i] + dx;
      into.l[row] = into.l[row] == null ? sl : Math.min(into.l[row], sl);
      into.r[row] = into.r[row] == null ? sr : Math.max(into.r[row], sr);
    }
    for (const b of sub.boxes) into.boxes.push({ node: b.node, cx: b.cx + dx, row: b.row + dRow });
    for (const ln of sub.lines)
      into.lines.push({ x1: ln.x1 + dx, y1: ln.y1 + dy, x2: ln.x2 + dx, y2: ln.y2 + dy });
    into.rows = Math.max(into.rows, dRow + sub.rows);
  }
  function layoutHierTree(roots, cons, frameCx, frameCy) {
    if (!roots.length) return null;
    const bh = cons.boxAspect;
    const pitch = bh + cons.sp;
    const rowTop = (row) => row * pitch;
    let stdRows = 0;
    for (const root of roots) {
      const rows = stdRowsOf(root);
      if (rows > stdRows) stdRows = rows;
    }
    const layout = (node, depth) => {
      const kids = kidsOf(node);
      const assts = asstsOf(node);
      const out = { rows: 1, l: [-0.5], r: [0.5], boxes: [{ node, cx: 0, row: 0 }], lines: [] };
      if (!kids.length && !assts.length) return out;
      const branch = branchOf(node, depth, kids, stdRows);
      const mir = branch === "hangL" ? -1 : 1;
      const trunkX = branch === "std" ? 0 : mir * (cons.trunkOff - 0.5);
      const childRow0 = 1 + (assts.length ? 1 : 0);
      if (assts.length) {
        const asstMidY = rowTop(1) + bh / 2;
        assts.forEach((a, j) => {
          const right = trunkX - cons.sp / 2 - j * (1 + cons.sibSp);
          out.boxes.push({ node: a, cx: right - 0.5, row: 1 });
          out.lines.push({ x1: right, y1: asstMidY, x2: trunkX, y2: asstMidY });
          out.l[1] = Math.min(out.l[1] ?? Infinity, right - 1);
          out.r[1] = Math.max(out.r[1] ?? -Infinity, trunkX);
        });
        out.rows = 2;
      }
      if (!kids.length) {
        out.lines.push({ x1: trunkX, y1: bh, x2: trunkX, y2: rowTop(1) + bh / 2 });
        return out;
      }
      const subs = kids.map((k) => layout(k, depth + 1));
      if (branch === "std") {
        const merged2 = { l: [], r: [] };
        const offs = [];
        for (const sub of subs) {
          let dx = 0;
          if (offs.length) {
            dx = -Infinity;
            for (let i = 0; i < sub.rows; i++)
              if (merged2.r[i] != null) dx = Math.max(dx, merged2.r[i] + cons.sibSp - sub.l[i]);
            if (!Number.isFinite(dx)) dx = merged2.r[0] + cons.sibSp - sub.l[0];
          }
          offs.push(dx);
          for (let i = 0; i < sub.rows; i++) {
            merged2.l[i] = merged2.l[i] == null ? sub.l[i] + dx : Math.min(merged2.l[i], sub.l[i] + dx);
            merged2.r[i] = merged2.r[i] == null ? sub.r[i] + dx : Math.max(merged2.r[i], sub.r[i] + dx);
          }
        }
        const mid = (offs[0] + offs[offs.length - 1]) / 2;
        const busY = rowTop(childRow0) - cons.sp / 2;
        out.lines.push({ x1: trunkX, y1: bh, x2: trunkX, y2: busY });
        for (let i = 0; i < subs.length; i++) {
          const cx = offs[i] - mid;
          out.lines.push({ x1: trunkX, y1: busY, x2: cx, y2: busY });
          out.lines.push({ x1: cx, y1: busY, x2: cx, y2: rowTop(childRow0) });
          shiftSub(subs[i], cx, childRow0, out, rowTop(childRow0));
        }
      } else {
        let row = childRow0;
        let lastMidY = bh;
        for (const sub of subs) {
          const cx = mir * (cons.hangIndent - 0.5 + 0.5);
          const midY = rowTop(row) + bh / 2;
          out.lines.push({ x1: trunkX, y1: midY, x2: cx - mir * 0.5, y2: midY });
          shiftSub(sub, cx, row, out, rowTop(row));
          lastMidY = midY;
          row += sub.rows;
        }
        out.lines.push({ x1: trunkX, y1: bh, x2: trunkX, y2: lastMidY });
      }
      return out;
    };
    const top = { rows: 0, l: [], r: [], boxes: [], lines: [] };
    const merged = { l: [], r: [] };
    let placed = 0;
    for (const r of roots) {
      const sub = layout(r, 1);
      let dx = 0;
      if (placed) {
        dx = -Infinity;
        for (let i = 0; i < sub.rows; i++)
          if (merged.r[i] != null) dx = Math.max(dx, merged.r[i] + cons.sibSp - sub.l[i]);
        if (!Number.isFinite(dx)) dx = 0;
      }
      for (let i = 0; i < sub.rows; i++) {
        merged.l[i] = merged.l[i] == null ? sub.l[i] + dx : Math.min(merged.l[i], sub.l[i] + dx);
        merged.r[i] = merged.r[i] == null ? sub.r[i] + dx : Math.max(merged.r[i], sub.r[i] + dx);
      }
      shiftSub(sub, dx, 0, top, 0);
      placed++;
    }
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < top.rows; i++) {
      if (top.l[i] != null) minX = Math.min(minX, top.l[i]);
      if (top.r[i] != null) maxX = Math.max(maxX, top.r[i]);
    }
    for (const ln of top.lines) {
      minX = Math.min(minX, ln.x1, ln.x2);
      maxX = Math.max(maxX, ln.x1, ln.x2);
    }
    const unitW = maxX - minX;
    const unitH = top.rows * bh + (top.rows - 1) * cons.sp;
    if (!(unitW > 0) || !(unitH > 0)) return null;
    const scale2 = Math.min(frameCx / unitW, frameCy / unitH);
    const offX = (frameCx - unitW * scale2) / 2 - minX * scale2;
    const offY = (frameCy - unitH * scale2) / 2;
    const boxes = top.boxes.map((b) => ({
      node: b.node,
      x: offX + (b.cx - 0.5) * scale2,
      y: offY + rowTop(b.row) * scale2,
      w: scale2,
      h: bh * scale2
    }));
    const lines = top.lines.map((ln) => ({
      x: offX + Math.min(ln.x1, ln.x2) * scale2,
      y: offY + Math.min(ln.y1, ln.y2) * scale2,
      cx: Math.abs(ln.x2 - ln.x1) * scale2,
      cy: Math.abs(ln.y2 - ln.y1) * scale2
    }));
    return { boxes, lines, boxW: scale2 };
  }

  // ../genoffice/packages/pptx-engine/src/scan.ts
  var TAG_RE = /<\/?(?:[^<>"']|"[^"]*"|'[^']*')*>/g;
  var NAME_RE = /^<\/?\s*([A-Za-z_][\w:.-]*)/;
  var SHAPE_TAGS = /* @__PURE__ */ new Set([
    "p:sp",
    "p:pic",
    "p:graphicFrame",
    "p:grpSp",
    "p:cxnSp",
    "mc:AlternateContent"
  ]);
  function scanSlide(slideXml) {
    const spTreeOpen = /<p:spTree(?:\s(?:[^<>"']|"[^"]*"|'[^']*')*)?>/.exec(slideXml);
    if (!spTreeOpen) {
      throw new Error("slide xml has no <p:spTree> element");
    }
    const scanFrom = spTreeOpen.index + spTreeOpen[0].length;
    const elements = [];
    TAG_RE.lastIndex = scanFrom;
    let depth = 0;
    let currentStart = -1;
    let currentName = "";
    let match;
    let spTreeCloseAt = -1;
    while ((match = TAG_RE.exec(slideXml)) !== null) {
      const tag = match[0];
      if (tag.startsWith("<!--") || tag.startsWith("<![") || tag.startsWith("<?")) continue;
      const isClosing = tag.startsWith("</");
      const isSelfClosing = !isClosing && tag.endsWith("/>");
      const name = NAME_RE.exec(tag)?.[1] ?? "";
      if (isClosing) {
        if (depth === 0) {
          if (name === "p:spTree") {
            spTreeCloseAt = match.index;
            break;
          }
          throw new Error(`unexpected closing tag </${name}> at spTree level`);
        }
        depth--;
        if (depth === 0 && SHAPE_TAGS.has(currentName)) {
          elements.push({ name: currentName, start: currentStart, end: match.index + tag.length });
        }
      } else if (isSelfClosing) {
        if (depth === 0 && SHAPE_TAGS.has(name)) {
          elements.push({ name, start: match.index, end: match.index + tag.length });
        }
      } else {
        if (depth === 0) {
          currentStart = match.index;
          currentName = name;
        }
        depth++;
      }
    }
    if (spTreeCloseAt < 0) throw new Error("slide xml: unterminated <p:spTree>");
    for (let i = 0; i + 1 < elements.length; i++) {
      const gap = slideXml.slice(elements[i].end, elements[i + 1].start);
      if (gap) elements[i].gapAfter = gap;
    }
    const firstShapeStart = elements.length ? elements[0].start : spTreeCloseAt;
    const lastShapeEnd = elements.length ? elements[elements.length - 1].end : spTreeCloseAt;
    return {
      elements,
      bodyPrefix: slideXml.slice(0, firstShapeStart),
      bodySuffix: slideXml.slice(lastShapeEnd)
    };
  }

  // ../genoffice/packages/pptx-engine/src/table-grid.ts
  function tableRowGridCols(row) {
    const cols = [];
    let c = 0;
    row.forEach((cell, i) => {
      cols.push(c);
      const span = cell.gridSpan ?? 1;
      const followers = span > 1 ? row.slice(i + 1, i + span) : [];
      c += followers.length === span - 1 && followers.every((f) => f.merged) ? 1 : span;
    });
    return cols;
  }

  // ../genoffice/packages/pptx-engine/src/color.ts
  function resolveColorNode(node, theme, phClr) {
    if (!node) return void 0;
    const n = asXmlNode(node);
    let base;
    let mods;
    if (n["a:srgbClr"]) {
      mods = asXmlNode(n["a:srgbClr"]);
      base = "#" + String(mods["@_val"]).toUpperCase();
    } else if (n["a:schemeClr"]) {
      mods = asXmlNode(n["a:schemeClr"]);
      base = resolveSchemeColor(String(mods["@_val"]), theme, phClr);
    } else if (n["a:sysClr"]) {
      mods = asXmlNode(n["a:sysClr"]);
      base = sysColorHex(mods["@_val"], mods["@_lastClr"]);
    } else if (n["a:prstClr"]) {
      mods = asXmlNode(n["a:prstClr"]);
      const raw = String(mods["@_val"] ?? "");
      base = PRESET_COLORS[raw] ?? PRESET_COLORS_LOWER.get(raw.toLowerCase()) ?? PRESET_COLORS[raw.charAt(0).toLowerCase() + raw.slice(1)];
    }
    if (!base) return void 0;
    return applyColorMods(base, mods);
  }
  var PRESET_COLORS = {
    aliceBlue: "#F0F8FF",
    antiqueWhite: "#FAEBD7",
    aqua: "#00FFFF",
    aquamarine: "#7FFFD4",
    azure: "#F0FFFF",
    beige: "#F5F5DC",
    bisque: "#FFE4C4",
    black: "#000000",
    blanchedAlmond: "#FFEBCD",
    blue: "#0000FF",
    blueViolet: "#8A2BE2",
    brown: "#A52A2A",
    burlyWood: "#DEB887",
    cadetBlue: "#5F9EA0",
    chartreuse: "#7FFF00",
    chocolate: "#D2691E",
    coral: "#FF7F50",
    cornflowerBlue: "#6495ED",
    cornsilk: "#FFF8DC",
    crimson: "#DC143C",
    cyan: "#00FFFF",
    darkBlue: "#00008B",
    darkCyan: "#008B8B",
    darkGoldenrod: "#B8860B",
    darkGray: "#A9A9A9",
    darkGreen: "#006400",
    darkGrey: "#A9A9A9",
    darkKhaki: "#BDB76B",
    darkMagenta: "#8B008B",
    darkOliveGreen: "#556B2F",
    darkOrange: "#FF8C00",
    darkOrchid: "#9932CC",
    darkRed: "#8B0000",
    darkSalmon: "#E9967A",
    darkSeaGreen: "#8FBC8F",
    darkSlateBlue: "#483D8B",
    darkSlateGray: "#2F4F4F",
    darkSlateGrey: "#2F4F4F",
    darkTurquoise: "#00CED1",
    darkViolet: "#9400D3",
    deepPink: "#FF1493",
    deepSkyBlue: "#00BFFF",
    dimGray: "#696969",
    dimGrey: "#696969",
    dkBlue: "#00008B",
    dkCyan: "#008B8B",
    dkGoldenrod: "#B8860B",
    dkGray: "#A9A9A9",
    dkGreen: "#006400",
    dkGrey: "#A9A9A9",
    dkKhaki: "#BDB76B",
    dkMagenta: "#8B008B",
    dkOliveGreen: "#556B2F",
    dkOrange: "#FF8C00",
    dkOrchid: "#9932CC",
    dkRed: "#8B0000",
    dkSalmon: "#E9967A",
    dkSeaGreen: "#8FBC8F",
    dkSlateBlue: "#483D8B",
    dkSlateGray: "#2F4F4F",
    dkSlateGrey: "#2F4F4F",
    dkTurquoise: "#00CED1",
    dkViolet: "#9400D3",
    dodgerBlue: "#1E90FF",
    firebrick: "#B22222",
    floralWhite: "#FFFAF0",
    forestGreen: "#228B22",
    fuchsia: "#FF00FF",
    gainsboro: "#DCDCDC",
    ghostWhite: "#F8F8FF",
    gold: "#FFD700",
    goldenrod: "#DAA520",
    gray: "#808080",
    green: "#008000",
    greenYellow: "#ADFF2F",
    grey: "#808080",
    honeydew: "#F0FFF0",
    hotPink: "#FF69B4",
    indianRed: "#CD5C5C",
    indigo: "#4B0082",
    ivory: "#FFFFF0",
    khaki: "#F0E68C",
    lavender: "#E6E6FA",
    lavenderBlush: "#FFF0F5",
    lawnGreen: "#7CFC00",
    lemonChiffon: "#FFFACD",
    lightBlue: "#ADD8E6",
    lightCoral: "#F08080",
    lightCyan: "#E0FFFF",
    lightGoldenrodYellow: "#FAFAD2",
    lightGray: "#D3D3D3",
    lightGreen: "#90EE90",
    lightGrey: "#D3D3D3",
    lightPink: "#FFB6C1",
    lightSalmon: "#FFA07A",
    lightSeaGreen: "#20B2AA",
    lightSkyBlue: "#87CEFA",
    lightSlateGray: "#778899",
    lightSlateGrey: "#778899",
    lightSteelBlue: "#B0C4DE",
    lightYellow: "#FFFFE0",
    lime: "#00FF00",
    limeGreen: "#32CD32",
    linen: "#FAF0E6",
    ltBlue: "#ADD8E6",
    ltCoral: "#F08080",
    ltCyan: "#E0FFFF",
    ltGoldenrodYellow: "#FAFAD2",
    ltGray: "#D3D3D3",
    ltGreen: "#90EE90",
    ltGrey: "#D3D3D3",
    ltPink: "#FFB6C1",
    ltSalmon: "#FFA07A",
    ltSeaGreen: "#20B2AA",
    ltSkyBlue: "#87CEFA",
    ltSlateGray: "#778899",
    ltSlateGrey: "#778899",
    ltSteelBlue: "#B0C4DE",
    ltYellow: "#FFFFE0",
    magenta: "#FF00FF",
    maroon: "#800000",
    medAquamarine: "#66CDAA",
    medBlue: "#0000CD",
    mediumAquamarine: "#66CDAA",
    mediumBlue: "#0000CD",
    mediumOrchid: "#BA55D3",
    mediumPurple: "#9370DB",
    mediumSeaGreen: "#3CB371",
    mediumSlateBlue: "#7B68EE",
    mediumSpringGreen: "#00FA9A",
    mediumTurquoise: "#48D1CC",
    mediumVioletRed: "#C71585",
    medOrchid: "#BA55D3",
    medPurple: "#9370DB",
    medSeaGreen: "#3CB371",
    medSlateBlue: "#7B68EE",
    medSpringGreen: "#00FA9A",
    medTurquoise: "#48D1CC",
    medVioletRed: "#C71585",
    midnightBlue: "#191970",
    mintCream: "#F5FFFA",
    mistyRose: "#FFE4E1",
    moccasin: "#FFE4B5",
    navajoWhite: "#FFDEAD",
    navy: "#000080",
    oldLace: "#FDF5E6",
    olive: "#808000",
    oliveDrab: "#6B8E23",
    orange: "#FFA500",
    orangeRed: "#FF4500",
    orchid: "#DA70D6",
    paleGoldenrod: "#EEE8AA",
    paleGreen: "#98FB98",
    paleTurquoise: "#AFEEEE",
    paleVioletRed: "#DB7093",
    papayaWhip: "#FFEFD5",
    peachPuff: "#FFDAB9",
    peru: "#CD853F",
    pink: "#FFC0CB",
    plum: "#DDA0DD",
    powderBlue: "#B0E0E6",
    purple: "#800080",
    red: "#FF0000",
    rosyBrown: "#BC8F8F",
    royalBlue: "#4169E1",
    saddleBrown: "#8B4513",
    salmon: "#FA8072",
    sandyBrown: "#F4A460",
    seaGreen: "#2E8B57",
    seaShell: "#FFF5EE",
    sienna: "#A0522D",
    silver: "#C0C0C0",
    skyBlue: "#87CEEB",
    slateBlue: "#6A5ACD",
    slateGray: "#708090",
    slateGrey: "#708090",
    snow: "#FFFAFA",
    springGreen: "#00FF7F",
    steelBlue: "#4682B4",
    tan: "#D2B48C",
    teal: "#008080",
    thistle: "#D8BFD8",
    tomato: "#FF6347",
    turquoise: "#40E0D0",
    violet: "#EE82EE",
    wheat: "#F5DEB3",
    white: "#FFFFFF",
    whiteSmoke: "#F5F5F5",
    yellow: "#FFFF00",
    yellowGreen: "#9ACD32"
  };
  var PRESET_COLORS_LOWER = new Map(
    Object.entries(PRESET_COLORS).map(([k, v]) => [k.toLowerCase(), v])
  );
  function applyColorMods(hex, mods) {
    let { r, g, b } = hexToRgb(hex);
    const pct = (k) => {
      const v = asXmlNode(mods?.[k])["@_val"];
      return v != null ? (parseInt(String(v), 10) || 0) / 1e5 : void 0;
    };
    const lumMod = pct("a:lumMod");
    const lumOff = pct("a:lumOff");
    const shade4 = pct("a:shade");
    const tint2 = pct("a:tint");
    const hueOffV = asXmlNode(mods?.["a:hueOff"])["@_val"];
    const hueOff = hueOffV != null ? (parseInt(String(hueOffV), 10) || 0) / 6e4 : void 0;
    const satOff = pct("a:satOff");
    if (hueOff != null && hueOff !== 0 || satOff != null && satOff !== 0) {
      const { h, s, l } = rgbToHsl(r, g, b);
      const h2 = ((h + (hueOff ?? 0) / 360) % 1 + 1) % 1;
      const s2 = Math.max(0, Math.min(1, s + (satOff ?? 0)));
      const rgb2 = hslToRgb(h2, s2, l);
      r = rgb2.r;
      g = rgb2.g;
      b = rgb2.b;
    }
    const satMod = pct("a:satMod");
    if (satMod != null) {
      const { h, s, l } = rgbToHsl(r, g, b);
      const rgb2 = hslToRgb(h, Math.max(0, Math.min(1, s * satMod)), l);
      r = rgb2.r;
      g = rgb2.g;
      b = rgb2.b;
    }
    if (lumMod != null || lumOff != null) {
      const { h, s, l } = rgbToHsl(r, g, b);
      const l2 = Math.max(0, Math.min(1, l * (lumMod ?? 1) + (lumOff ?? 0)));
      const rgb2 = hslToRgb(h, s, l2);
      r = rgb2.r;
      g = rgb2.g;
      b = rgb2.b;
    }
    const lin = (v) => Math.pow(Math.max(v, 0) / 255, 2.2);
    const unlin = (v) => 255 * Math.pow(Math.max(v, 0), 1 / 2.2);
    if (shade4 != null) {
      r = unlin(lin(r) * shade4);
      g = unlin(lin(g) * shade4);
      b = unlin(lin(b) * shade4);
    }
    if (tint2 != null) {
      r = unlin(lin(r) * tint2 + (1 - tint2));
      g = unlin(lin(g) * tint2 + (1 - tint2));
      b = unlin(lin(b) * tint2 + (1 - tint2));
    }
    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
    let out = "#" + [clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
    const alpha = pct("a:alpha");
    if (alpha != null && alpha < 1) {
      out += Math.round(alpha * 255).toString(16).padStart(2, "0").toUpperCase();
    }
    return out;
  }
  function hexToRgb(hex) {
    const h = hex.replace(/^#/, "");
    return {
      r: parseInt(h.slice(0, 2), 16) || 0,
      g: parseInt(h.slice(2, 4), 16) || 0,
      b: parseInt(h.slice(4, 6), 16) || 0
    };
  }
  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return { h, s, l };
  }
  function scaleLuminance(hex, factor) {
    const { r, g, b } = hexToRgb(hex);
    const { h, s, l } = rgbToHsl(r, g, b);
    const rgb = hslToRgb(h, s, Math.max(0, Math.min(0.97, l * factor)));
    const to2 = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
    return ("#" + to2(rgb.r) + to2(rgb.g) + to2(rgb.b)).toUpperCase();
  }
  function hslToRgb(h, s, l) {
    if (s === 0) {
      const v = l * 255;
      return { r: v, g: v, b: v };
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return { r: f(h + 1 / 3) * 255, g: f(h) * 255, b: f(h - 1 / 3) * 255 };
  }

  // ../genoffice/packages/pptx-engine/src/placeholder.ts
  var phParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    isArray: (name) => ["p:sp"].includes(name)
  });
  var TITLE_TYPES = /* @__PURE__ */ new Set(["title", "ctrTitle"]);
  var BODY_TYPES = /* @__PURE__ */ new Set(["body", "subTitle", "obj", ""]);
  var ANCHOR_MAP = {
    t: "top",
    ctr: "middle",
    b: "bottom"
  };
  var FILL_TAGS = ["a:solidFill", "a:gradFill", "a:blipFill", "a:pattFill", "a:noFill"];
  function parseXfrmNode(xfrmRaw) {
    if (!xfrmRaw) return null;
    const xfrm = asXmlNode(xfrmRaw);
    const offRaw = xfrm["a:off"];
    const extRaw = xfrm["a:ext"];
    if (!offRaw && !extRaw) return null;
    const off = asXmlNode(offRaw);
    const ext = asXmlNode(extRaw);
    return {
      offset: {
        x: offRaw ? parseInt(String(off["@_x"]), 10) || 0 : 0,
        y: offRaw ? parseInt(String(off["@_y"]), 10) || 0 : 0,
        cx: extRaw ? parseInt(String(ext["@_cx"]), 10) || 0 : 0,
        cy: extRaw ? parseInt(String(ext["@_cy"]), 10) || 0 : 0
      },
      rot: xfrm["@_rot"] ? parseInt(String(xfrm["@_rot"]), 10) || 0 : 0,
      flipH: xfrm["@_flipH"] === "1" || xfrm["@_flipH"] === "true",
      flipV: xfrm["@_flipV"] === "1" || xfrm["@_flipV"] === "true"
    };
  }
  function parsePlaceholderMap(layoutOrMasterXml, theme, mediaRels) {
    const src = { mediaRels, foreignPart: true };
    const entries = [];
    let doc;
    try {
      doc = asXmlNode(phParser.parse(layoutOrMasterXml));
    } catch {
      return { entries };
    }
    const root = asXmlNode(doc["p:sldLayout"] ?? doc["p:sldMaster"]);
    const spTreeRaw = asXmlNode(root["p:cSld"])["p:spTree"];
    if (!spTreeRaw) return { entries };
    const spTree = asXmlNode(spTreeRaw);
    for (const sp of xmlArray(spTree["p:sp"])) {
      const phRaw = asXmlNode(asXmlNode(sp["p:nvSpPr"])["p:nvPr"])["p:ph"];
      if (!phRaw) continue;
      const ph = asXmlNode(phRaw);
      const type = String(ph["@_type"] ?? "body");
      const idx = ph["@_idx"] != null ? String(ph["@_idx"]) : "";
      const spPr = asXmlNode(sp["p:spPr"]);
      const transform = parseXfrmNode(spPr["a:xfrm"]);
      const textStyle = parseLstStyleLevels(asXmlNode(sp["p:txBody"])["a:lstStyle"], theme, src);
      const bodyPrNode = asXmlNode(asXmlNode(sp["p:txBody"])["a:bodyPr"]);
      const anchor = ANCHOR_MAP[String(bodyPrNode["@_anchor"] ?? "")];
      const anchorCtrRaw = bodyPrNode["@_anchorCtr"];
      const anchorCtr = anchorCtrRaw != null ? String(anchorCtrRaw) === "1" || anchorCtrRaw === "true" : void 0;
      const insEntries = ["l", "t", "r", "b"].flatMap((k) => {
        const v = bodyPrNode[`@_${k}Ins`];
        const n = v != null ? parseInt(String(v), 10) : NaN;
        return Number.isFinite(n) ? [[k, n]] : [];
      });
      const insets = insEntries.length ? Object.fromEntries(insEntries) : void 0;
      const hasFill = FILL_TAGS.some((tag) => tag in spPr);
      const prstGeomNode = asXmlNode(spPr["a:prstGeom"]);
      const prst = prstGeomNode["@_prst"] != null ? String(prstGeomNode["@_prst"]) : void 0;
      const presetGeom = prst && prst !== "rect" ? { prst, avLstRaw: prstGeomNode["a:avLst"] } : void 0;
      if (!transform && !textStyle && !anchor && anchorCtr === void 0 && !insets && !hasFill && !presetGeom)
        continue;
      entries.push({
        type,
        idx,
        transform,
        ...textStyle ? { textStyle } : {},
        ...anchor ? { anchor } : {},
        ...anchorCtr !== void 0 ? { anchorCtr } : {},
        ...insets ? { insets } : {},
        ...hasFill ? { fillSpPr: spPr } : {},
        ...presetGeom ? { presetGeom } : {}
      });
    }
    return { entries };
  }
  var ALIGN_MAP = {
    l: "left",
    ctr: "center",
    r: "right",
    just: "justify"
  };
  function spcPctVal(node) {
    const v = asXmlNode(asXmlNode(node)["a:spcPct"])["@_val"];
    return v != null ? parseInt(String(v), 10) / 1e3 : void 0;
  }
  function spcPtsVal(node) {
    const v = asXmlNode(asXmlNode(node)["a:spcPts"])["@_val"];
    return v != null ? parseInt(String(v), 10) / 100 : void 0;
  }
  function typefaceAttr(node) {
    const v = asXmlNode(node)["@_typeface"];
    return v != null ? String(v) : void 0;
  }
  function parseLvlPPr(pPrRaw, theme, src) {
    if (!pPrRaw || typeof pPrRaw !== "object") return void 0;
    const pPr = asXmlNode(pPrRaw);
    const out = {};
    const algn = String(pPr["@_algn"] ?? "");
    if (algn && ALIGN_MAP[algn]) out.align = ALIGN_MAP[algn];
    const lineHeight = spcPctVal(pPr["a:lnSpc"]);
    const lineExact = spcPtsVal(pPr["a:lnSpc"]);
    if (lineHeight != null) out.lineHeight = lineHeight;
    if (lineExact != null) out.lineExact = lineExact;
    const spcBef = pPr["a:spcBef"];
    const spcAft = pPr["a:spcAft"];
    if (spcPtsVal(spcBef) != null) out.spaceBefore = spcPtsVal(spcBef);
    if (spcPctVal(spcBef) != null) out.spaceBeforePct = spcPctVal(spcBef);
    if (spcPtsVal(spcAft) != null) out.spaceAfter = spcPtsVal(spcAft);
    if (spcPctVal(spcAft) != null) out.spaceAfterPct = spcPctVal(spcAft);
    const buChar = asXmlNode(pPr["a:buChar"])["@_char"];
    if (pPr["a:buNone"] !== void 0) out.bullet = { type: "none" };
    else if (buChar != null) {
      out.bullet = { type: "char", char: decodeNumericCharRefs(String(buChar)) };
    } else if (pPr["a:buAutoNum"]) {
      out.bullet = { type: "number" };
      const an = asXmlNode(pPr["a:buAutoNum"]);
      if (an["@_type"] != null) out.bullet.numType = String(an["@_type"]);
      const startAt = parseInt(String(an["@_startAt"]), 10);
      if (Number.isFinite(startAt) && startAt > 1) out.bullet.startAt = startAt;
    } else if (pPr["a:buBlip"] !== void 0) {
      out.bullet = { type: "blip" };
      const embed = asXmlNode(asXmlNode(pPr["a:buBlip"])["a:blip"])["@_r:embed"];
      if (embed != null) {
        if (!src?.foreignPart) out.bullet.blipEmbedId = String(embed);
        const ref = src?.mediaRels?.get(String(embed));
        if (ref) out.bullet.mediaRef = ref;
      }
    }
    if (out.bullet && out.bullet.type !== "none") {
      const buFont = typefaceAttr(pPr["a:buFont"]);
      if (buFont) out.bullet.font = buFont;
      const buColor = resolveColorNode(pPr["a:buClr"], theme);
      if (buColor) out.bullet.color = buColor;
      const buSz = asXmlNode(pPr["a:buSzPct"])["@_val"];
      if (buSz != null) out.bullet.sizePct = (parseInt(String(buSz), 10) || 0) / 1e3;
      const buSzPts = asXmlNode(pPr["a:buSzPts"])["@_val"];
      if (buSzPts != null) out.bullet.sizePt = (parseInt(String(buSzPts), 10) || 0) / 100;
    }
    if (pPr["@_marL"] != null) {
      const v = parseInt(String(pPr["@_marL"]), 10);
      if (!Number.isNaN(v)) out.marL = v;
    }
    if (pPr["@_indent"] != null) {
      const v = parseInt(String(pPr["@_indent"]), 10);
      if (!Number.isNaN(v)) out.indent = v;
    }
    Object.assign(out, parseDefRPrStyle(pPr["a:defRPr"], theme));
    return Object.keys(out).length ? out : void 0;
  }
  function parseDefRPrStyle(defRPrRaw, theme, phClr) {
    if (!defRPrRaw || typeof defRPrRaw !== "object") return void 0;
    const defRPr = asXmlNode(defRPrRaw);
    const out = {};
    if (defRPr["@_sz"]) out.fontSize = parseInt(String(defRPr["@_sz"]), 10) / 100;
    if (defRPr["@_b"] != null) out.bold = defRPr["@_b"] === "1" || defRPr["@_b"] === "true";
    if (defRPr["@_i"] != null) out.italic = defRPr["@_i"] === "1" || defRPr["@_i"] === "true";
    if (defRPr["@_cap"] != null) out.cap = String(defRPr["@_cap"]);
    const color = resolveColorNode(defRPr["a:solidFill"], theme, phClr);
    if (color) out.color = color;
    const shdw = asXmlNode(asXmlNode(defRPr["a:effectLst"])["a:outerShdw"]);
    const shdwColor = resolveColorNode(shdw, theme, phClr);
    if (shdwColor) {
      const num = (k) => {
        const v = parseInt(String(shdw[k] ?? ""), 10);
        return Number.isFinite(v) ? v : 0;
      };
      out.shadow = {
        color: shdwColor,
        blurRad: num("@_blurRad"),
        dist: num("@_dist"),
        dirDeg: num("@_dir") / 6e4
      };
    }
    const eaScript = eaScriptOfLang(defRPr["@_altLang"]) ?? eaScriptOfLang(defRPr["@_lang"]);
    if (eaScript) out.eaScript = eaScript;
    const latinAttr = typefaceAttr(defRPr["a:latin"]);
    const latin = resolveFontRef(latinAttr, theme, eaScript);
    if (latin) out.latinFont = latin;
    if (latinAttr?.startsWith("+")) out.latinFontRef = latinAttr;
    const eaAttr = typefaceAttr(defRPr["a:ea"]);
    const ea = resolveFontRef(eaAttr, theme, eaScript);
    if (ea) out.eaFont = ea;
    if (eaAttr?.startsWith("+")) out.eaFontRef = eaAttr;
    const cs = resolveFontRef(typefaceAttr(defRPr["a:cs"]), theme, eaScript);
    if (cs) out.csFont = cs;
    return Object.keys(out).length ? out : void 0;
  }
  function parseLstStyleLevels(lst, theme, src) {
    if (!lst || typeof lst !== "object") return void 0;
    const l = asXmlNode(lst);
    const levels = [];
    for (let i = 1; i <= 9; i++) levels[i - 1] = parseLvlPPr(l[`a:lvl${i}pPr`], theme, src);
    return levels.some(Boolean) ? { levels } : void 0;
  }
  function parseDefaultTextStyle(presentationXml, theme) {
    let doc;
    try {
      doc = asXmlNode(phParser.parse(presentationXml));
    } catch {
      return void 0;
    }
    return parseLstStyleLevels(asXmlNode(doc["p:presentation"])["p:defaultTextStyle"], theme);
  }
  function parseMasterTextStyles(masterXml, theme, mediaRels) {
    const src = { mediaRels, foreignPart: true };
    let doc;
    try {
      doc = asXmlNode(phParser.parse(masterXml));
    } catch {
      return {};
    }
    const txRaw = asXmlNode(doc["p:sldMaster"])["p:txStyles"];
    if (!txRaw) return {};
    const tx = asXmlNode(txRaw);
    return {
      ...parseLstStyleLevels(tx["p:titleStyle"], theme, src) ? { title: parseLstStyleLevels(tx["p:titleStyle"], theme, src) } : {},
      ...parseLstStyleLevels(tx["p:bodyStyle"], theme, src) ? { body: parseLstStyleLevels(tx["p:bodyStyle"], theme, src) } : {},
      ...parseLstStyleLevels(tx["p:otherStyle"], theme, src) ? { other: parseLstStyleLevels(tx["p:otherStyle"], theme, src) } : {}
    };
  }
  function findStyleInMap(map, type, idx) {
    if (!map || map.entries.length === 0) return void 0;
    const t = type ?? "body";
    const i = idx ?? "";
    const styled = map.entries.filter((e) => e.textStyle);
    let hit = styled.find((e) => e.type === t && e.idx === i);
    if (!hit && i !== "") hit = styled.find((e) => e.idx === i);
    if (!hit) hit = styled.find((e) => e.type === t);
    if (!hit && TITLE_TYPES.has(t)) hit = styled.find((e) => TITLE_TYPES.has(e.type));
    if (!hit && BODY_TYPES.has(t)) hit = styled.find((e) => BODY_TYPES.has(e.type));
    return hit?.textStyle;
  }
  function findAnchorInMap(map, type, idx) {
    if (!map || map.entries.length === 0) return void 0;
    const t = type ?? "body";
    const i = idx ?? "";
    const anchored = map.entries.filter((e) => e.anchor);
    let hit = anchored.find((e) => e.type === t && e.idx === i);
    if (!hit) hit = anchored.find((e) => e.type === t);
    if (!hit && TITLE_TYPES.has(t)) hit = anchored.find((e) => TITLE_TYPES.has(e.type));
    if (!hit && BODY_TYPES.has(t)) hit = anchored.find((e) => BODY_TYPES.has(e.type));
    return hit?.anchor;
  }
  function findInsetsInMap(map, type, idx) {
    if (!map || map.entries.length === 0) return void 0;
    const t = type ?? "body";
    const i = idx ?? "";
    const carriers = map.entries.filter((e) => e.insets);
    let hit = carriers.find((e) => e.type === t && e.idx === i);
    if (!hit) hit = carriers.find((e) => e.type === t);
    if (!hit && TITLE_TYPES.has(t)) hit = carriers.find((e) => TITLE_TYPES.has(e.type));
    if (!hit && BODY_TYPES.has(t)) hit = carriers.find((e) => BODY_TYPES.has(e.type));
    return hit?.insets;
  }
  function resolvePlaceholderInsets(layout, master, type, idx) {
    const fromLayout = findInsetsInMap(layout, type, idx);
    const fromMaster = findInsetsInMap(master, type, idx);
    if (!fromLayout || !fromMaster) return fromLayout ?? fromMaster;
    return { ...fromMaster, ...fromLayout };
  }
  function resolvePlaceholderAnchor(layout, master, type, idx) {
    return findAnchorInMap(layout, type, idx) ?? findAnchorInMap(master, type, idx);
  }
  function findAnchorCtrInMap(map, type, idx) {
    if (!map || map.entries.length === 0) return void 0;
    const t = type ?? "body";
    const i = idx ?? "";
    const marked = map.entries.filter((e) => e.anchorCtr !== void 0);
    let hit = marked.find((e) => e.type === t && e.idx === i);
    if (!hit) hit = marked.find((e) => e.type === t);
    if (!hit && TITLE_TYPES.has(t)) hit = marked.find((e) => TITLE_TYPES.has(e.type));
    if (!hit && BODY_TYPES.has(t)) hit = marked.find((e) => BODY_TYPES.has(e.type));
    return hit?.anchorCtr;
  }
  function resolvePlaceholderAnchorCtr(layout, master, type, idx) {
    return findAnchorCtrInMap(layout, type, idx) ?? findAnchorCtrInMap(master, type, idx);
  }
  function placeholderStyleChain(layout, master, masterTx, type, idx) {
    const chain = [];
    const fromLayout = findStyleInMap(layout, type, idx);
    if (fromLayout) chain.push({ ...fromLayout, src: "layout placeholder" });
    const fromMaster = findStyleInMap(master, type, idx);
    if (fromMaster) chain.push({ ...fromMaster, src: "master placeholder" });
    const t = type ?? "body";
    const [family, familySrc] = TITLE_TYPES.has(t) ? [masterTx?.title, "master titleStyle"] : BODY_TYPES.has(t) ? [masterTx?.body, "master bodyStyle"] : [masterTx?.other, "master otherStyle"];
    if (family) chain.push({ ...family, src: familySrc });
    return chain;
  }
  function mergeTextStyleChain(chain, level) {
    const out = {};
    const src = {};
    let any = false;
    for (const layer of chain) {
      if (!layer) continue;
      const lvl = layer.levels[level] ?? layer.levels[0];
      if (!lvl) continue;
      any = true;
      const from = layer.src ?? "inherited";
      if (out.fontSize == null && lvl.fontSize != null) {
        out.fontSize = lvl.fontSize;
        src.fontSize = from;
      }
      if (out.bold == null && lvl.bold != null) {
        out.bold = lvl.bold;
        src.bold = from;
      }
      if (out.italic == null && lvl.italic != null) {
        out.italic = lvl.italic;
        src.italic = from;
      }
      if (out.cap == null && lvl.cap != null) out.cap = lvl.cap;
      if (out.color == null && lvl.color != null) {
        out.color = lvl.color;
        src.color = from;
      }
      if (out.shadow == null && lvl.shadow != null) out.shadow = lvl.shadow;
      if (out.latinFont == null && lvl.latinFont != null) {
        out.latinFont = lvl.latinFont;
        if (lvl.latinFontRef != null) out.latinFontRef = lvl.latinFontRef;
        src.latinFont = from;
      }
      if (out.eaFont == null && lvl.eaFont != null) {
        out.eaFont = lvl.eaFont;
        if (lvl.eaFontRef != null) out.eaFontRef = lvl.eaFontRef;
        src.eaFont = from;
      }
      if (out.csFont == null && lvl.csFont != null) {
        out.csFont = lvl.csFont;
        src.csFont = from;
      }
      if (out.eaScript == null && lvl.eaScript != null) out.eaScript = lvl.eaScript;
      if (out.align == null && lvl.align != null) {
        out.align = lvl.align;
        src.align = from;
      }
      if (out.bullet == null && lvl.bullet != null) out.bullet = lvl.bullet;
      if (out.marL == null && lvl.marL != null) out.marL = lvl.marL;
      if (out.indent == null && lvl.indent != null) out.indent = lvl.indent;
      if (out.lineHeight == null && out.lineExact == null && (lvl.lineHeight != null || lvl.lineExact != null)) {
        if (lvl.lineHeight != null) out.lineHeight = lvl.lineHeight;
        if (lvl.lineExact != null) out.lineExact = lvl.lineExact;
      }
      if (out.spaceBefore == null && out.spaceBeforePct == null && (lvl.spaceBefore != null || lvl.spaceBeforePct != null)) {
        if (lvl.spaceBefore != null) out.spaceBefore = lvl.spaceBefore;
        if (lvl.spaceBeforePct != null) out.spaceBeforePct = lvl.spaceBeforePct;
      }
      if (out.spaceAfter == null && out.spaceAfterPct == null && (lvl.spaceAfter != null || lvl.spaceAfterPct != null)) {
        if (lvl.spaceAfter != null) out.spaceAfter = lvl.spaceAfter;
        if (lvl.spaceAfterPct != null) out.spaceAfterPct = lvl.spaceAfterPct;
      }
    }
    if (Object.keys(src).length) out.src = src;
    return any ? out : void 0;
  }
  function findInMap(map, type, idx) {
    if (!map || map.entries.length === 0) return void 0;
    const t = type ?? "body";
    const i = idx ?? "";
    const geo = map.entries.filter((e) => e.transform);
    let hit = geo.find((e) => e.type === t && e.idx === i);
    if (hit) return hit.transform;
    if (i !== "") {
      hit = geo.find((e) => e.idx === i);
      if (hit) return hit.transform;
    }
    hit = geo.find((e) => e.type === t);
    if (hit) return hit.transform;
    if (TITLE_TYPES.has(t)) {
      hit = geo.find((e) => TITLE_TYPES.has(e.type));
      if (hit) return hit.transform;
    }
    if (BODY_TYPES.has(t)) {
      hit = geo.find((e) => BODY_TYPES.has(e.type));
      if (hit) return hit.transform;
    }
    return void 0;
  }
  function resolvePlaceholderFillSpPr(layout, master, type, idx) {
    const t = type ?? "body";
    const i = idx ?? "";
    for (const [map, layer] of [
      [layout, "layout"],
      [master, "master"]
    ]) {
      if (!map) continue;
      const entries = map.entries;
      const hit = entries.find((e) => e.type === t && e.idx === i) ?? (i !== "" ? entries.find((e) => e.idx === i) : void 0) ?? entries.find((e) => e.type === t) ?? (TITLE_TYPES.has(t) ? entries.find((e) => TITLE_TYPES.has(e.type)) : void 0) ?? (BODY_TYPES.has(t) ? entries.find((e) => BODY_TYPES.has(e.type)) : void 0);
      if (hit?.fillSpPr != null) return { spPr: hit.fillSpPr, layer };
    }
    return void 0;
  }
  function resolvePlaceholderTransform(layout, master, type, idx) {
    return findInMap(layout, type, idx) ?? findInMap(master, type, idx);
  }
  function resolvePlaceholderPresetGeom(layout, master, type, idx) {
    const t = type ?? "body";
    const i = idx ?? "";
    for (const map of [layout, master]) {
      if (!map) continue;
      const entries = map.entries;
      const hit = entries.find((e) => e.type === t && e.idx === i) ?? (i !== "" ? entries.find((e) => e.idx === i) : void 0) ?? entries.find((e) => e.type === t) ?? (TITLE_TYPES.has(t) ? entries.find((e) => TITLE_TYPES.has(e.type)) : void 0) ?? (BODY_TYPES.has(t) ? entries.find((e) => BODY_TYPES.has(e.type)) : void 0);
      if (hit?.presetGeom) return hit.presetGeom;
      if (hit) return void 0;
    }
    return void 0;
  }

  // ../genoffice/packages/pptx-engine/src/chart.ts
  var chartParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: false,
    parseTagValue: false,
    isArray: (name) => ["c:ser", "c:pt", "c:lvl", "c:dPt"].includes(name)
  });
  function parseChartXml(xml, theme, resolveFill2) {
    let doc;
    try {
      doc = chartParser.parse(xml);
    } catch {
      return null;
    }
    const date1904Node = doc["c:chartSpace"]?.["c:date1904"];
    const date1904Raw = typeof date1904Node === "object" && date1904Node !== null ? String(date1904Node["@_val"] ?? "").trim().toLowerCase() : "";
    const date1904 = date1904Node != null && (date1904Raw === "" || date1904Raw === "1" || date1904Raw === "true" || date1904Raw === "on");
    const chart = doc["c:chartSpace"]?.["c:chart"];
    const plotArea = chart?.["c:plotArea"];
    if (!plotArea) return null;
    const plots = (n) => Array.isArray(n) ? n : n ? [n] : [];
    const cartesian = [];
    const stockPlot = plotArea["c:stockChart"];
    for (const p of plots(plotArea["c:barChart"] ?? plotArea["c:bar3DChart"]))
      cartesian.push({ kind: "bar", plot: p });
    for (const p of plots(plotArea["c:areaChart"] ?? plotArea["c:area3DChart"]))
      cartesian.push({ kind: "area", plot: p });
    for (const p of plots(plotArea["c:lineChart"] ?? plotArea["c:line3DChart"]))
      cartesian.push({ kind: "line", plot: p });
    for (const p of plots(stockPlot)) cartesian.push({ kind: "line", plot: p, stock: true });
    const piePlot = plotArea["c:pieChart"] ?? plotArea["c:pie3DChart"] ?? plotArea["c:doughnutChart"] ?? plotArea["c:ofPieChart"];
    const is3D = !!(plotArea["c:bar3DChart"] || plotArea["c:area3DChart"] || plotArea["c:line3DChart"] || plotArea["c:pie3DChart"]);
    let kind;
    let plot;
    let ofPie;
    if (cartesian.length) {
      kind = cartesian[0].kind;
      plot = cartesian[0].plot;
    } else if (piePlot) {
      kind = "pie";
      plot = piePlot;
      if (plotArea["c:ofPieChart"]) {
        const num = (k, dflt) => {
          const v = parseInt(piePlot[k]?.["@_val"], 10);
          return Number.isFinite(v) && v > 0 ? v : dflt;
        };
        ofPie = {
          splitPos: num("c:splitPos", 2),
          secondPieSize: num("c:secondPieSize", 75),
          gapWidth: num("c:gapWidth", 150)
        };
      }
    } else if (plotArea["c:scatterChart"] || plotArea["c:bubbleChart"]) {
      kind = "scatter";
      plot = plotArea["c:scatterChart"] ?? plotArea["c:bubbleChart"];
    } else if (plotArea["c:radarChart"]) {
      kind = "radar";
      plot = plotArea["c:radarChart"];
    } else {
      return null;
    }
    const valAxRaw = plotArea["c:valAx"];
    const valAxes = Array.isArray(valAxRaw) ? valAxRaw : valAxRaw ? [valAxRaw] : [];
    const secValAxNode = kind !== "scatter" && cartesian.length > 1 ? valAxes.find((a) => a?.["c:axPos"]?.["@_val"] === "r" && a?.["c:delete"]?.["@_val"] !== "1") : void 0;
    const secAxId = secValAxNode?.["c:axId"]?.["@_val"];
    const plotAxIds = (plotNode) => {
      const raw = plotNode?.["c:axId"];
      const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
      return arr.map((a) => a?.["@_val"]).filter((v) => v != null);
    };
    const series = [];
    const plotGroups = [];
    let categories = [];
    let catSerials;
    let categoryGroups;
    const parsePlotSeries = (plotNode, plotKind, tagPlotKind, secondary = false, fromStock = false) => {
      const groupStart = series.length;
      const sersRaw = plotNode["c:ser"];
      const sers = Array.isArray(sersRaw) ? sersRaw : sersRaw ? [sersRaw] : [];
      const plotMarkerNode = plotNode["c:marker"];
      const plotMarker = plotMarkerNode != null && plotMarkerNode?.["@_val"] !== "0";
      for (const ser of sers) {
        if (series.length >= MAX_CHART_SERIES) break;
        const s = {
          values: readNumPoints(plotKind === "scatter" ? ser["c:yVal"] : ser["c:val"])
        };
        if (!s.values.length) continue;
        if (tagPlotKind) s.plotKind = plotKind;
        const palIdx = parseInt(ser["c:idx"]?.["@_val"], 10);
        if (Number.isFinite(palIdx)) s.paletteIdx = palIdx;
        if (secondary) s.secondaryAxis = true;
        if (plotKind === "bar" && ser["c:spPr"] && "a:noFill" in ser["c:spPr"]) s.noFill = true;
        if (fromStock) s.fromStock = true;
        if (plotKind === "scatter") {
          const xs = readNumPoints(ser["c:xVal"]);
          if (xs.length) s.xValues = xs;
          const sizes = readNumPoints(ser["c:bubbleSize"]);
          if (sizes.length) s.bubbleSizes = sizes;
        }
        const name = readStrPoints(ser["c:tx"])[0];
        if (name != null) s.name = name;
        const color = serColor(
          ser,
          theme,
          !s.bubbleSizes && (plotKind === "line" || plotKind === "scatter" || plotKind === "radar")
        );
        if (color) s.color = color;
        if (ser["c:smooth"]?.["@_val"] === "1") s.smooth = true;
        const serExtRaw = ser["c:extLst"]?.["c:ext"];
        const serExts = Array.isArray(serExtRaw) ? serExtRaw : serExtRaw ? [serExtRaw] : [];
        const rangeCache = serExts.map((e) => e?.["c15:datalabelsRange"]?.["c15:dlblRangeCache"]).find(Boolean);
        const dLblExtRaw = ser["c:dLbls"]?.["c:extLst"]?.["c:ext"];
        const dLblExts = Array.isArray(dLblExtRaw) ? dLblExtRaw : dLblExtRaw ? [dLblExtRaw] : [];
        const showRange = dLblExts.some((e) => e?.["c15:showDataLabelsRange"]?.["@_val"] === "1");
        if (rangeCache && showRange) {
          const labs = readPoints(rangeCache).map((v) => v ?? "");
          if (labs.some((v) => v)) s.pointLabels = labs;
        }
        const serLn = ser["c:spPr"]?.["a:ln"];
        const serDash = serLn?.["a:prstDash"]?.["@_val"];
        if (typeof serDash === "string" && serDash !== "solid") s.dash = serDash;
        const serLnW = parseInt(serLn?.["@_w"], 10);
        if (Number.isFinite(serLnW) && serLnW > 0) s.lineWidthPt = serLnW / 12700;
        const dlOn = (d) => !!d && typeof d === "object" && d["c:delete"]?.["@_val"] !== "1" && (d["c:showVal"]?.["@_val"] === "1" || d["c:showPercent"]?.["@_val"] === "1");
        const serDl = ser["c:dLbls"];
        s.dataLabels = serDl && typeof serDl === "object" ? dlOn(serDl) : dlOn(plotNode["c:dLbls"]);
        if (serDl && typeof serDl === "object") {
          const fmt = serDl["c:numFmt"]?.["@_formatCode"];
          if (typeof fmt === "string" && fmt && fmt !== "General") s.dataLabelFmt = fmt;
          const box = labelBox(serDl["c:spPr"], theme);
          if (box.fill) s.dataLabelFill = box.fill;
          if (box.border) s.dataLabelBorder = box.border;
        }
        const dLblRaw = serDl?.["c:dLbl"];
        const overrides = (Array.isArray(dLblRaw) ? dLblRaw : dLblRaw ? [dLblRaw] : []).map((d) => {
          const idx = parseInt(d?.["c:idx"]?.["@_val"], 10);
          if (!Number.isFinite(idx)) return null;
          if (d["c:delete"]?.["@_val"] === "1") return { idx, hidden: true };
          const flag = (k) => d[k]?.["@_val"] === "1";
          if (!["c:showVal", "c:showCatName", "c:showSerName", "c:showPercent"].some((k) => k in d))
            return null;
          const dP = d["c:txPr"]?.["a:p"];
          const rPr = (Array.isArray(dP) ? dP[0] : dP)?.["a:pPr"]?.["a:defRPr"];
          const sz = parseInt(rPr?.["@_sz"], 10);
          const color2 = resolveColorNode(rPr?.["a:solidFill"], theme);
          const box = labelBox(d["c:spPr"], theme);
          return {
            idx,
            val: flag("c:showVal"),
            cat: flag("c:showCatName"),
            ser: flag("c:showSerName"),
            pct: flag("c:showPercent"),
            ...Number.isFinite(sz) && sz > 0 ? { sizePt: sz / 100 } : {},
            ...color2 ? { color: color2 } : {},
            ...box
          };
        }).filter((o) => o != null);
        if (overrides.length) {
          s.dLblOverrides = overrides;
          const serShowsAny = !!serDl && typeof serDl === "object" && serDl["c:delete"]?.["@_val"] !== "1" && ["c:showVal", "c:showPercent", "c:showCatName", "c:showSerName"].some(
            (k) => serDl[k]?.["@_val"] === "1"
          );
          if (overrides.some((o) => !o.hidden && (o.val || o.cat || o.ser || o.pct))) {
            s.dataLabels = true;
            if (!serShowsAny) s.dLblOnlyPoints = true;
          }
        }
        const markerSym = ser["c:marker"]?.["c:symbol"]?.["@_val"];
        if (plotKind === "line")
          s.marker = fromStock ? markerSym !== "none" : markerSym != null ? markerSym !== "none" : plotMarker;
        else if ((plotKind === "scatter" || plotKind === "radar") && markerSym != null)
          s.marker = markerSym !== "none";
        const expl = parseInt(ser["c:explosion"]?.["@_val"], 10);
        if (Number.isFinite(expl) && expl > 0) s.explosionPct = expl;
        const dPts = ser["c:dPt"] ?? [];
        if (dPts.length) {
          const pointColors = [];
          const pointFills = [];
          const pointNoFill = [];
          const pointLines = [];
          const pointExpl = [];
          for (const dPt of dPts) {
            const idx = parseInt(dPt["c:idx"]?.["@_val"], 10);
            if (!Number.isFinite(idx) || idx < 0 || idx >= s.values.length) continue;
            const dSp = dPt["c:spPr"];
            const c = resolveColorNode(dSp?.["a:solidFill"], theme);
            if (c != null) pointColors[idx] = c;
            if (dSp && "a:noFill" in dSp) pointNoFill[idx] = true;
            else if (dSp && c == null) {
              const f = resolveFill2?.(dSp);
              if (f && f.type !== "none") pointFills[idx] = f;
            }
            const dLn = dSp?.["a:ln"];
            if (dLn && typeof dLn === "object") {
              const lnColor = "a:noFill" in dLn ? null : resolveColorNode(dLn["a:solidFill"], theme);
              const lnW = parseInt(dLn["@_w"], 10);
              if (lnColor !== void 0)
                pointLines[idx] = {
                  color: lnColor,
                  ...Number.isFinite(lnW) && lnW > 0 ? { widthPt: lnW / 12700 } : {}
                };
            }
            const pe = parseInt(dPt["c:explosion"]?.["@_val"], 10);
            if (Number.isFinite(pe)) pointExpl[idx] = pe;
          }
          if (pointColors.length) s.pointColors = pointColors;
          if (pointFills.length) s.pointFills = pointFills;
          if (pointNoFill.length) s.pointNoFill = pointNoFill;
          if (pointLines.length) s.pointLines = pointLines;
          if (pointExpl.length) s.pointExplosionPct = pointExpl;
        }
        series.push(s);
        if (!categories.length) {
          categories = readStrPoints(ser["c:cat"], date1904);
          catSerials = readDateSerials(ser["c:cat"]);
        }
        if (!categoryGroups) {
          const multi = ser["c:cat"]?.["c:multiLvlStrRef"]?.["c:multiLvlStrCache"];
          const lvlsRaw = multi?.["c:lvl"];
          const lvls = Array.isArray(lvlsRaw) ? lvlsRaw : lvlsRaw ? [lvlsRaw] : [];
          if (lvls.length > 1) {
            const ptsRaw = lvls[1]?.["c:pt"];
            const pts = Array.isArray(ptsRaw) ? ptsRaw : ptsRaw ? [ptsRaw] : [];
            const groups = pts.map((pt) => {
              const v = pt?.["c:v"];
              return {
                label: typeof v === "string" ? v : v != null ? String(v["#text"] ?? "") : "",
                start: parseInt(pt?.["@_idx"], 10) || 0
              };
            }).sort((a, b) => a.start - b.start);
            if (groups.length) categoryGroups = groups;
          }
        }
      }
      const grouping = plotNode["c:grouping"]?.["@_val"];
      plotGroups.push({
        start: groupStart,
        end: series.length,
        stacked: (plotKind === "bar" || plotKind === "area") && (grouping === "stacked" || grouping === "percentStacked"),
        hbar: plotKind === "bar" && plotNode["c:barDir"]?.["@_val"] === "bar"
      });
    };
    if (cartesian.length > 1) {
      for (const c of cartesian)
        parsePlotSeries(
          c.plot,
          c.kind,
          true,
          secAxId != null && plotAxIds(c.plot).includes(secAxId),
          !!c.stock
        );
    } else parsePlotSeries(plot, kind, false, false, !!cartesian[0]?.stock);
    if (!series.length) return null;
    if (!categories.length) {
      let n = 0;
      for (const s of series) if (s.values.length > n) n = s.values.length;
      categories = Array.from({ length: n }, () => "");
    }
    const model = { kind, categories, series };
    if (ofPie) model.ofPie = ofPie;
    if (categoryGroups) model.categoryGroups = categoryGroups;
    if (is3D) {
      model.pseudo3D = true;
      const rotX2 = parseInt(chart["c:view3D"]?.["c:rotX"]?.["@_val"], 10);
      if (Number.isFinite(rotX2)) model.rotXDeg = rotX2;
      const b3 = plotArea["c:bar3DChart"];
      const a3 = plotArea["c:area3DChart"];
      const v3 = chart["c:view3D"];
      const num = (node, dflt) => {
        const v = parseInt(node?.["@_val"], 10);
        return Number.isFinite(v) ? v : dflt;
      };
      const serAx = plotArea["c:serAx"];
      const serAxLabels = serAx != null && serAx["c:delete"]?.["@_val"] !== "1" && serAx["c:tickLblPos"]?.["@_val"] !== "none";
      if (b3) {
        model.bar3D = {
          rotX: num(v3?.["c:rotX"], 15),
          rotY: num(v3?.["c:rotY"], 20),
          depthPct: num(v3?.["c:depthPercent"], 100),
          rAngAx: v3?.["c:rAngAx"]?.["@_val"] !== "0",
          gapDepthPct: num(b3["c:gapDepth"], 150),
          serAxLabels
        };
      }
      if (a3) {
        model.area3D = {
          rotX: num(v3?.["c:rotX"], 15),
          rotY: num(v3?.["c:rotY"], 20),
          gapDepthPct: num(a3["c:gapDepth"], 150),
          serAxLabels
        };
      }
    }
    if (kind === "bar" || kind === "area" || kind === "line") {
      const grouping = plot["c:grouping"]?.["@_val"];
      if (grouping) model.grouping = grouping;
    }
    if (kind === "bar") {
      const dir = plot["c:barDir"]?.["@_val"];
      model.barDir = dir === "bar" ? "bar" : "col";
      const gap = plot["c:gapWidth"]?.["@_val"];
      model.gapWidthPct = gap != null ? parseInt(gap, 10) : 150;
      const ov = plot["c:overlap"]?.["@_val"];
      if (ov != null) model.overlapPct = parseInt(ov, 10) || 0;
    }
    if (kind === "pie") {
      const hole = plot["c:holeSize"]?.["@_val"];
      model.holePct = hole != null ? parseInt(hole, 10) || 0 : plotArea["c:doughnutChart"] ? 50 : 0;
      const first = plot["c:firstSliceAng"]?.["@_val"];
      if (first != null) model.firstSliceAngDeg = parseInt(first, 10) || 0;
      const vary = plot["c:varyColors"]?.["@_val"];
      if (vary === "0" || vary === "false") model.varyColors = false;
    }
    if (kind === "scatter") {
      const st = plot["c:scatterStyle"]?.["@_val"];
      if (st) model.scatterStyle = String(st);
      const bScale = parseInt(plot["c:bubbleScale"]?.["@_val"], 10);
      if (Number.isFinite(bScale) && bScale > 0) model.bubbleScale = bScale;
      if (plot["c:sizeRepresents"]?.["@_val"] === "w") model.bubbleSizeIsWidth = true;
    }
    if (kind === "radar") {
      const st = plot["c:radarStyle"]?.["@_val"];
      model.radarStyle = st === "filled" ? "filled" : st === "marker" ? "marker" : "standard";
    }
    if (stockPlot) {
      const udb = stockPlot["c:upDownBars"];
      const gw = parseInt(udb?.["c:gapWidth"]?.["@_val"], 10);
      model.stock = {
        hiLowLines: stockPlot["c:hiLowLines"] !== void 0,
        upDownBars: udb !== void 0,
        ...Number.isFinite(gw) && gw >= 0 ? { gapWidthPct: gw } : {}
      };
    }
    const legendNode = chart["c:legend"];
    const legendPos = legendNode?.["c:legendPos"]?.["@_val"];
    if (legendNode) {
      model.legendPos = legendPos ?? "r";
      const overlay = legendNode["c:overlay"]?.["@_val"];
      if (overlay === "1" || overlay === void 0 && legendPos === void 0) {
        model.legendOverlay = true;
      }
      const man = legendNode["c:layout"]?.["c:manualLayout"];
      if (man) {
        const frac = (k) => {
          const v = Number(man[k]?.["@_val"]);
          return Number.isFinite(v) ? v : void 0;
        };
        const mode = (k) => man[k]?.["@_val"] === "edge" ? "edge" : "factor";
        const [lx, ly, lw, lh] = [frac("c:x"), frac("c:y"), frac("c:w"), frac("c:h")];
        if (lx !== void 0 || ly !== void 0) {
          model.legendLayout = {
            ...lx !== void 0 ? { x: lx, xMode: mode("c:xMode") } : {},
            ...ly !== void 0 ? { y: ly, yMode: mode("c:yMode") } : {},
            ...lw !== void 0 && lw > 0 ? { w: lw } : {},
            ...lh !== void 0 && lh > 0 ? { h: lh } : {}
          };
        }
      }
      const legP = chart["c:legend"]?.["c:txPr"]?.["a:p"];
      const legRPr = (Array.isArray(legP) ? legP[0] : legP)?.["a:pPr"]?.["a:defRPr"];
      if (legRPr?.["@_baseline"] === "-2147483648") delete model.legendPos;
      const legSz = parseInt(legRPr?.["@_sz"], 10);
      if (Number.isFinite(legSz) && legSz > 0) model.legendPt = legSz / 100;
      if (legRPr?.["@_b"] === "1") model.legendBold = true;
      const legPPr = (Array.isArray(legP) ? legP[0] : legP)?.["a:pPr"];
      if (legPPr?.["@_rtl"] === "1") model.legendRtl = true;
      const sideLegend = model.legendPos === "r" || model.legendPos === "l" || model.legendPos === "tr";
      const catAxes = [plotArea["c:catAx"], plotArea["c:dateAx"]].flatMap(
        (raw) => Array.isArray(raw) ? raw : raw ? [raw] : []
      );
      const catReversed = catAxes.some(
        (ax) => ax?.["c:delete"]?.["@_val"] !== "1" && ax?.["c:scaling"]?.["c:orientation"]?.["@_val"] === "maxMin"
      );
      const order = plotGroups.flatMap((g) => {
        const idx = [];
        for (let i = g.start; i < g.end; i++) idx.push(i);
        return g.hbar && !catReversed || g.stacked && sideLegend ? idx.reverse() : idx;
      });
      const entriesRaw = legendNode["c:legendEntry"];
      const entries = Array.isArray(entriesRaw) ? entriesRaw : entriesRaw ? [entriesRaw] : [];
      const deleted = new Set(
        entries.filter((e) => e?.["c:delete"]?.["@_val"] === "1").map((e) => parseInt(e?.["c:idx"]?.["@_val"], 10))
      );
      const shown = order.filter((_, pos) => !deleted.has(pos));
      if (shown.length !== series.length || shown.some((si, k) => si !== k)) model.legendOrder = shown;
    }
    const mLay = plotArea["c:layout"]?.["c:manualLayout"];
    if (mLay?.["c:layoutTarget"]?.["@_val"] === "inner") {
      const frac = (k) => Number(mLay[k]?.["@_val"]);
      const edgeMode = (k) => {
        const m = mLay[k]?.["@_val"];
        return m == null || m === "edge";
      };
      const [lx, ly, lw, lh] = [frac("c:x"), frac("c:y"), frac("c:w"), frac("c:h")];
      if (edgeMode("c:xMode") && edgeMode("c:yMode") && [lx, ly, lw, lh].every(Number.isFinite) && lw > 0 && lh > 0) {
        model.plotLayout = { x: lx, y: ly, w: lw, h: lh };
      }
    }
    const paSpPr = plotArea["c:spPr"];
    const paFill = resolveFill2?.(paSpPr) ?? (() => {
      const c = resolveColorNode(paSpPr?.["a:solidFill"], theme);
      return c ? { type: "solid", color: c } : void 0;
    })();
    if (paFill && paFill.type !== "none") model.plotFill = paFill;
    const paLn = paSpPr?.["a:ln"];
    const paBorderColor = paLn && !paLn["a:noFill"] && resolveColorNode(paLn["a:solidFill"], theme);
    if (paBorderColor) {
      const w = parseInt(paLn["@_w"], 10);
      model.plotBorder = { color: paBorderColor, widthEmu: Number.isFinite(w) && w > 0 ? w : 9525 };
    }
    const bgFill = resolveFill2?.(doc["c:chartSpace"]?.["c:spPr"]);
    if (bgFill && bgFill.type !== "none") model.bgFill = bgFill;
    const spLn = doc["c:chartSpace"]?.["c:spPr"]?.["a:ln"];
    const borderColor = spLn && !spLn["a:noFill"] && resolveColorNode(spLn["a:solidFill"], theme);
    if (borderColor) {
      const w = parseInt(spLn["@_w"], 10);
      model.border = { color: borderColor, widthEmu: Number.isFinite(w) && w > 0 ? w : 9525 };
    }
    if (theme) {
      const accents = ["accent1", "accent2", "accent3", "accent4", "accent5", "accent6"].map((k) => theme.colors?.[k]).filter((c) => !!c);
      if (accents.length === 6) model.themePalette = accents;
    }
    const styleVal = parseInt(doc["c:chartSpace"]?.["c:style"]?.["@_val"], 10);
    const styleCol = Number.isFinite(styleVal) ? (styleVal - 1) % 8 : -1;
    if (styleCol >= 2 && model.themePalette && series.length && series.every((s) => !s.color)) {
      const base = model.themePalette[styleCol - 2];
      if (base) {
        const anchors = [0.77, 0.93, 1.44, 1.92];
        const lumAt = (p) => {
          const x = p * (anchors.length - 1);
          const i = Math.min(Math.floor(x), anchors.length - 2);
          return anchors[i] + (anchors[i + 1] - anchors[i]) * (x - i);
        };
        series.forEach((s, i) => {
          s.color = scaleLuminance(base, series.length === 1 ? 1 : lumAt(i / (series.length - 1)));
        });
      }
    }
    const txP = doc["c:chartSpace"]?.["c:txPr"]?.["a:p"];
    const txDefRPr = (Array.isArray(txP) ? txP[0] : txP)?.["a:pPr"]?.["a:defRPr"];
    const defSz = parseInt(txDefRPr?.["@_sz"], 10);
    if (Number.isFinite(defSz) && defSz > 0) model.defaultTextPt = defSz / 100;
    const defColor = resolveColorNode(txDefRPr?.["a:solidFill"], theme);
    if (defColor) model.defaultTextColor = defColor;
    if (styleVal >= 41 && styleVal <= 48) {
      const csSpPr = doc["c:chartSpace"]?.["c:spPr"];
      const explicitFill = csSpPr && ["a:noFill", "a:solidFill", "a:gradFill", "a:blipFill", "a:pattFill"].some((k) => k in csSpPr);
      const dk1 = theme?.colors?.dk1 ?? "#000000";
      if (!explicitFill) model.bgFill = { type: "solid", color: dk1 };
      if (!paFill && !paSpPr?.["a:noFill"]) {
        const mods = { "a:lumMod": { "@_val": "75000" }, "a:lumOff": { "@_val": "25000" } };
        model.plotFill = { type: "solid", color: applyColorMods(dk1, mods) };
      }
      if (!model.defaultTextColor) model.defaultTextColor = theme?.colors?.lt1 ?? "#FFFFFF";
    }
    const chartTitle = collectText(chart["c:title"]?.["c:tx"]?.["c:rich"]) || readStrPoints(chart["c:title"]?.["c:tx"])[0];
    if (chart["c:title"]?.["c:overlay"]?.["@_val"] === "1") model.titleOverlay = true;
    if (chartTitle) model.title = chartTitle;
    else if (chart["c:title"] && !chart["c:title"]?.["c:tx"] && chart["c:autoTitleDeleted"]?.["@_val"] !== "1") {
      model.title = series.length === 1 && series[0].name || "Chart Title";
    }
    if (model.title) {
      const titP = chart["c:title"]?.["c:txPr"]?.["a:p"];
      const titleSz = parseInt(
        (Array.isArray(titP) ? titP[0] : titP)?.["a:pPr"]?.["a:defRPr"]?.["@_sz"],
        10
      );
      if (Number.isFinite(titleSz) && titleSz > 0) model.titlePt = titleSz / 100;
      const rich = chart["c:title"]?.["c:tx"]?.["c:rich"];
      const p0 = Array.isArray(rich?.["a:p"]) ? rich["a:p"][0] : rich?.["a:p"];
      const r0 = Array.isArray(p0?.["a:r"]) ? p0["a:r"][0] : p0?.["a:r"];
      const titleRPr = r0?.["a:rPr"] ?? p0?.["a:pPr"]?.["a:defRPr"];
      if (!model.titlePt) {
        const runSz = parseInt(titleRPr?.["@_sz"] ?? p0?.["a:pPr"]?.["a:defRPr"]?.["@_sz"], 10);
        if (Number.isFinite(runSz) && runSz > 0) model.titlePt = runSz / 100;
      }
      const styleLayers = [
        r0?.["a:rPr"],
        p0?.["a:pPr"]?.["a:defRPr"],
        (Array.isArray(titP) ? titP[0] : titP)?.["a:pPr"]?.["a:defRPr"]
      ].filter(Boolean);
      const styleAttr = (k) => styleLayers.map((l) => l[k]).find((v) => v != null);
      const b = styleAttr("@_b");
      if (b != null) model.titleBold = b === "1";
      if (styleAttr("@_i") === "1") model.titleItalic = true;
      const c = resolveColorNode(styleAttr("a:solidFill"), theme);
      if (c) model.titleColor = c;
    }
    const dLblsInfo = (owner) => {
      const d = owner?.["c:dLbls"];
      if (!d || typeof d !== "object" || d["c:delete"]?.["@_val"] === "1")
        return { on: false, pct: false };
      const showVal = d["c:showVal"]?.["@_val"] === "1";
      const showPct = d["c:showPercent"]?.["@_val"] === "1";
      const showSer = d["c:showSerName"]?.["@_val"] === "1";
      const showCat = d["c:showCatName"]?.["@_val"] === "1";
      const fmt = d["c:numFmt"]?.["@_formatCode"];
      const dP = d["c:txPr"]?.["a:p"];
      const dRPr = (Array.isArray(dP) ? dP[0] : dP)?.["a:pPr"]?.["a:defRPr"];
      const dSz = parseInt(dRPr?.["@_sz"], 10);
      return {
        on: showVal || showPct || showSer || showCat,
        pct: showPct && !showVal,
        valPct: showPct && showVal,
        ser: showSer,
        cat: showCat,
        val: showVal || showPct,
        ...typeof fmt === "string" && fmt && fmt !== "General" ? { fmt } : {},
        ...Number.isFinite(dSz) && dSz > 0 ? { sizePt: dSz / 100 } : {},
        ...dRPr?.["@_b"] === "1" ? { bold: true } : {}
      };
    };
    const dLblOwners = (cartesian.length > 1 ? cartesian.map((c) => c.plot) : [plot]).flatMap(
      (p) => [
        ...Array.isArray(p["c:ser"]) ? p["c:ser"] : p["c:ser"] ? [p["c:ser"]] : [],
        p
      ]
    );
    const dLblResults = dLblOwners.map(dLblsInfo);
    const latinOf = (txPr) => {
      const p = txPr?.["a:p"];
      const p0 = Array.isArray(p) ? p[0] : p;
      const r = p0?.["a:r"];
      const rPr = (Array.isArray(r) ? r[0] : r)?.["a:rPr"];
      const face = rPr?.["a:latin"]?.["@_typeface"] ?? p0?.["a:pPr"]?.["a:defRPr"]?.["a:latin"]?.["@_typeface"];
      return typeof face === "string" && face ? resolveFontRef(face, theme) : void 0;
    };
    const axisNodes = ["c:catAx", "c:valAx", "c:dateAx", "c:serAx"].flatMap((k) => {
      const raw = plotArea[k];
      return Array.isArray(raw) ? raw : raw ? [raw] : [];
    });
    const fontFamily = latinOf(doc["c:chartSpace"]?.["c:txPr"]) ?? axisNodes.map((a) => latinOf(a?.["c:txPr"])).find(Boolean) ?? latinOf(chart["c:legend"]?.["c:txPr"]) ?? dLblOwners.map((o) => latinOf(o?.["c:dLbls"]?.["c:txPr"])).find(Boolean) ?? latinOf(chart["c:title"]?.["c:tx"]?.["c:rich"]) ?? latinOf(chart["c:title"]?.["c:txPr"]);
    if (fontFamily) model.fontFamily = fontFamily;
    const found = dLblResults.find((r) => r.on);
    if (found) {
      model.dataLabels = true;
      if (found.pct) model.dataLabelsPct = true;
      if (found.valPct) model.dataLabelsValPct = true;
      if (found.ser) model.dataLabelSerName = true;
      if (found.cat) model.dataLabelCatName = true;
      if (found.on && !found.val) model.dataLabelNoValue = true;
      const fmt = found.fmt ?? dLblResults.find((r) => r.fmt)?.fmt;
      if (fmt) model.dataLabelFmt = fmt;
      const sizePt = found.sizePt ?? dLblResults.find((r) => r.sizePt)?.sizePt;
      if (sizePt) model.dataLabelPt = sizePt;
      if (found.bold ?? dLblResults.some((r) => r.bold)) model.dataLabelBold = true;
    }
    if (kind === "scatter" && valAxes.length >= 2) {
      const xAxNode = valAxes.find((a) => a?.["c:axPos"]?.["@_val"] === "b") ?? valAxes[0];
      const yAxNode = valAxes.find((a) => a !== xAxNode) ?? valAxes[1];
      const xAx = parseAxis(xAxNode, theme);
      if (xAx) model.catAxis = xAx;
      const yAx = parseAxis(yAxNode, theme);
      if (yAx) model.valAxis = yAx;
    } else {
      const valAxNode = valAxes.find((a) => a?.["c:axPos"]?.["@_val"] === "l") ?? valAxes[0];
      const valAx = parseAxis(valAxNode, theme);
      if (valAx) model.valAxis = valAx;
      if (secValAxNode) {
        const valAx2 = parseAxis(secValAxNode, theme);
        if (valAx2) model.valAxis2 = valAx2;
      }
      const toArr = (raw) => Array.isArray(raw) ? raw : raw ? [raw] : [];
      const catCands = [
        ...toArr(plotArea["c:catAx"]).map((n) => ({ n, date: false })),
        ...toArr(plotArea["c:dateAx"]).map((n) => ({ n, date: true }))
      ];
      const pick = catCands.find((c) => c.n?.["c:delete"]?.["@_val"] !== "1") ?? catCands[0];
      const catAx = parseAxis(pick?.n, theme);
      if (catAx || pick?.date)
        model.catAxis = { ...catAx ?? {}, ...pick?.date ? { isDate: true } : {} };
      if (pick?.date && catSerials && !categoryGroups) sortByDate(model, catSerials);
    }
    if (model.dataLabels && !model.dataLabelFmt && model.valAxis?.numFmt)
      model.dataLabelFmt = model.valAxis.numFmt;
    return model;
  }
  function readNumPoints(node) {
    const cache2 = node?.["c:numRef"]?.["c:numCache"] ?? node?.["c:numLit"];
    if (!cache2) return [];
    return readPoints(cache2).map((v) => {
      if (v == null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    });
  }
  function readStrPoints(node, date1904 = false) {
    const strCache = node?.["c:strRef"]?.["c:strCache"] ?? node?.["c:strLit"];
    if (strCache) return readPoints(strCache).map((v) => v ?? "");
    const lit = node?.["c:v"];
    if (lit != null) return [typeof lit === "string" ? lit : String(lit["#text"] ?? lit)];
    const multi = node?.["c:multiLvlStrRef"]?.["c:multiLvlStrCache"];
    if (multi) {
      const lvls = Array.isArray(multi["c:lvl"]) ? multi["c:lvl"] : multi["c:lvl"] ? [multi["c:lvl"]] : [];
      if (lvls.length) return readPoints(lvls[0]).map((v) => v ?? "");
    }
    const numCache = node?.["c:numRef"]?.["c:numCache"];
    if (numCache) {
      const fmt = numCache["c:formatCode"];
      const fmtStr = typeof fmt === "string" ? fmt : String(fmt?.["#text"] ?? "");
      const isDate = /[ymd]/i.test(fmtStr) && !/[#0?]/.test(fmtStr);
      return readPoints(numCache).map((v) => {
        if (v == null) return "";
        if (!isDate) return v;
        const serial = parseFloat(v);
        return Number.isFinite(serial) ? formatDateSerial(serial, fmtStr, date1904) : v;
      });
    }
    return [];
  }
  function readDateSerials(node) {
    const numCache = node?.["c:numRef"]?.["c:numCache"];
    if (!numCache) return void 0;
    const fmt = numCache["c:formatCode"];
    const fmtStr = typeof fmt === "string" ? fmt : String(fmt?.["#text"] ?? "");
    if (!/[ymd]/i.test(fmtStr) || /[#0?]/.test(fmtStr)) return void 0;
    const serials = readPoints(numCache).map((v) => v == null ? NaN : parseFloat(v));
    return serials.every((v) => Number.isFinite(v)) ? serials : void 0;
  }
  function sortByDate(model, serials) {
    const n = model.categories.length;
    if (serials.length !== n) return;
    const order = serials.map((_, i) => i).sort((a, b) => serials[a] - serials[b]);
    if (order.every((i, k) => i === k)) return;
    const permute = (arr) => [...order.map((i) => arr[i]), ...arr.slice(n)];
    const pick = (arr) => {
      if (!arr) return arr;
      const out = permute(arr);
      let end = out.length;
      while (end > 0 && out[end - 1] === void 0) end--;
      return end ? out.slice(0, end) : void 0;
    };
    model.categories = order.map((i) => model.categories[i]);
    const newIdx = new Map(order.map((i, k) => [i, k]));
    for (const s of model.series) {
      s.values = permute(s.values).map((v) => v ?? null);
      if (s.pointLabels) s.pointLabels = permute(s.pointLabels);
      s.pointColors = pick(s.pointColors);
      s.pointFills = pick(s.pointFills);
      s.pointNoFill = pick(s.pointNoFill);
      s.pointLines = pick(s.pointLines);
      s.pointExplosionPct = pick(s.pointExplosionPct);
      if (s.dLblOverrides)
        s.dLblOverrides = s.dLblOverrides.map((d) => ({ ...d, idx: newIdx.get(d.idx) ?? d.idx }));
    }
  }
  function formatDateSerial(serial, fmt, date1904) {
    const ms = (serial - (date1904 ? 24107 : 25569)) * 864e5;
    const d = new Date(ms);
    const yyyy = d.getUTCFullYear();
    const mNum = d.getUTCMonth() + 1;
    const dayNum = d.getUTCDate();
    const MONTHS = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec"
    ];
    return fmt.replace(/\\/g, "").replace(/yyyy/gi, String(yyyy)).replace(/yy/gi, String(yyyy % 100).padStart(2, "0")).replace(/mmm/gi, MONTHS[d.getUTCMonth()]).replace(/mm/gi, String(mNum).padStart(2, "0")).replace(/(?<![a-z])m(?![a-z])/gi, String(mNum)).replace(/dd/gi, String(dayNum).padStart(2, "0")).replace(/(?<![a-z])d(?![a-z])/gi, String(dayNum));
  }
  var MAX_CHART_POINTS = 1048576;
  var MAX_CHART_SERIES = 256;
  function readPoints(cache2) {
    const ptsRaw = cache2?.["c:pt"];
    const pts = Array.isArray(ptsRaw) ? ptsRaw : ptsRaw ? [ptsRaw] : [];
    const count = cache2?.["c:ptCount"]?.["@_val"];
    const parsed = count != null ? parseInt(count, 10) : pts.length;
    const n = Number.isFinite(parsed) ? Math.min(Math.max(0, parsed), MAX_CHART_POINTS) : pts.length;
    const out = new Array(
      Math.max(n, Math.min(pts.length, MAX_CHART_POINTS))
    ).fill(null);
    for (const pt of pts) {
      const idx = parseInt(pt["@_idx"], 10) || 0;
      if (idx < 0 || idx >= out.length) continue;
      const v = pt["c:v"];
      out[idx] = typeof v === "string" ? v : v != null ? String(v["#text"] ?? v) : null;
    }
    return out;
  }
  function serColor(ser, theme, preferLine) {
    const spPr = ser["c:spPr"];
    if (!spPr) return void 0;
    const lnColor = resolveColorNode(spPr["a:ln"]?.["a:solidFill"], theme);
    const fillColor = resolveColorNode(spPr["a:solidFill"], theme);
    return preferLine ? lnColor ?? fillColor : fillColor ?? lnColor;
  }
  function labelBox(spPr, theme) {
    if (!spPr || typeof spPr !== "object") return {};
    const out = {};
    if ("a:noFill" in spPr) out.fill = null;
    else {
      const fill = resolveColorNode(spPr["a:solidFill"], theme);
      if (fill) out.fill = fill;
    }
    const ln = spPr["a:ln"];
    if (ln && typeof ln === "object") {
      if ("a:noFill" in ln) out.border = null;
      else {
        const border = resolveColorNode(ln["a:solidFill"], theme);
        if (border) out.border = border;
      }
    }
    return out;
  }
  function parseAxis(ax, theme) {
    if (!ax || typeof ax !== "object") return void 0;
    const out = {};
    if (ax["c:delete"]?.["@_val"] === "1") out.hidden = true;
    const scaling = ax["c:scaling"];
    const min = Number(scaling?.["c:min"]?.["@_val"]);
    if (scaling?.["c:min"]?.["@_val"] != null && Number.isFinite(min)) out.min = min;
    const max = Number(scaling?.["c:max"]?.["@_val"]);
    if (scaling?.["c:max"]?.["@_val"] != null && Number.isFinite(max)) out.max = max;
    if (scaling?.["c:orientation"]?.["@_val"] === "maxMin") out.reversed = true;
    const logBase = Number(scaling?.["c:logBase"]?.["@_val"]);
    if (Number.isFinite(logBase) && logBase >= 2 && logBase <= 1e3) out.logBase = logBase;
    const crosses = ax["c:crosses"]?.["@_val"];
    if (crosses === "autoZero" || crosses === "min" || crosses === "max") out.crosses = crosses;
    const tickLblPos = ax["c:tickLblPos"]?.["@_val"];
    if (tickLblPos === "none") out.tickLblHidden = true;
    else if (tickLblPos === "low" || tickLblPos === "high") out.tickLblPos = tickLblPos;
    const defRPr = ax["c:txPr"]?.["a:p"]?.[0]?.["a:pPr"]?.["a:defRPr"] ?? ax["c:txPr"]?.["a:p"]?.["a:pPr"]?.["a:defRPr"];
    if (defRPr) {
      const c = resolveColorNode(defRPr["a:solidFill"], theme);
      if (c) out.labelColor = c;
      const axSz = parseInt(defRPr["@_sz"], 10);
      if (Number.isFinite(axSz) && axSz > 0) out.labelSizePt = axSz / 100;
      if (defRPr["@_b"] === "1") out.labelBold = true;
      if (defRPr["@_baseline"] === "-2147483648") out.tickLblGarbage = true;
    }
    const rot = parseInt(ax["c:txPr"]?.["a:bodyPr"]?.["@_rot"], 10);
    if (Number.isFinite(rot) && rot !== 0 && Math.abs(rot) <= 54e5) out.labelRotDeg = rot / 6e4;
    const numFmt = ax["c:numFmt"]?.["@_formatCode"];
    if (typeof numFmt === "string" && numFmt && numFmt !== "General") out.numFmt = numFmt;
    const lineColor = resolveColorNode(ax["c:spPr"]?.["a:ln"]?.["a:solidFill"], theme);
    if (lineColor) out.lineColor = lineColor;
    const grid = ax["c:majorGridlines"];
    if (grid !== void 0) {
      const ln = typeof grid === "object" ? grid["c:spPr"]?.["a:ln"] : void 0;
      const gc = resolveColorNode(ln?.["a:solidFill"], theme);
      out.gridColor = gc ?? "#E6E6E6";
      if (!gc) out.gridColorAuto = true;
      const dash = ln?.["a:prstDash"]?.["@_val"];
      if (dash && dash !== "solid") {
        out.gridDash = true;
        out.gridDashVal = String(dash);
      }
      const w = parseInt(ln?.["@_w"], 10);
      if (Number.isFinite(w) && w > 0) out.gridWidthEmu = w;
    }
    const minor = ax["c:minorGridlines"];
    if (minor !== void 0) {
      const ln = typeof minor === "object" ? minor["c:spPr"]?.["a:ln"] : void 0;
      const gc = resolveColorNode(ln?.["a:solidFill"], theme);
      if (gc) {
        out.minorGridColor = gc;
        const w = parseInt(ln?.["@_w"], 10);
        if (Number.isFinite(w) && w > 0) out.minorGridWidthEmu = w;
      } else {
        out.minorGridAuto = true;
      }
    }
    const majorUnit = Number(ax["c:majorUnit"]?.["@_val"]);
    if (Number.isFinite(majorUnit) && majorUnit > 0) out.majorUnit = majorUnit;
    const minorUnit = Number(ax["c:minorUnit"]?.["@_val"]);
    if (Number.isFinite(minorUnit) && minorUnit > 0) out.minorUnit = minorUnit;
    const lblSkip = parseInt(ax["c:tickLblSkip"]?.["@_val"], 10);
    if (Number.isFinite(lblSkip) && lblSkip > 1) out.tickLblSkip = lblSkip;
    const markSkip = parseInt(ax["c:tickMarkSkip"]?.["@_val"], 10);
    if (Number.isFinite(markSkip) && markSkip > 1) out.tickMarkSkip = markSkip;
    const titleNode = ax["c:title"];
    const title = collectText(titleNode?.["c:tx"]?.["c:rich"]);
    if (title) {
      out.title = title;
      if (titleNode?.["c:overlay"]?.["@_val"] === "1") out.titleOverlay = true;
      const tp0raw = titleNode?.["c:tx"]?.["c:rich"]?.["a:p"];
      const tp0 = Array.isArray(tp0raw) ? tp0raw[0] : tp0raw;
      const tr0 = Array.isArray(tp0?.["a:r"]) ? tp0["a:r"][0] : tp0?.["a:r"];
      const txp = titleNode?.["c:txPr"]?.["a:p"];
      const rPr = tr0?.["a:rPr"] ?? tp0?.["a:pPr"]?.["a:defRPr"] ?? (Array.isArray(txp) ? txp[0] : txp)?.["a:pPr"]?.["a:defRPr"];
      if (rPr) {
        const sz = parseInt(rPr["@_sz"], 10);
        if (Number.isFinite(sz) && sz > 0) out.titleSizePt = sz / 100;
        if (rPr["@_b"] === "1") out.titleBold = true;
        if (rPr["@_i"] === "1") out.titleItalic = true;
        const c = resolveColorNode(rPr["a:solidFill"], theme);
        if (c) out.titleColor = c;
      }
    }
    return Object.keys(out).length ? out : void 0;
  }
  function collectText(rich) {
    if (!rich) return void 0;
    const paras = Array.isArray(rich["a:p"]) ? rich["a:p"] : rich["a:p"] ? [rich["a:p"]] : [];
    const parts = [];
    for (const p of paras) {
      const runs = Array.isArray(p["a:r"]) ? p["a:r"] : p["a:r"] ? [p["a:r"]] : [];
      for (const r of runs) {
        const t = r["a:t"];
        parts.push(typeof t === "string" ? t : String(t?.["#text"] ?? ""));
      }
    }
    const s = parts.join("");
    return s.trim() ? s : void 0;
  }

  // ../genoffice/packages/pptx-engine/src/chartex.ts
  var cxParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: false,
    parseTagValue: false,
    isArray: (name) => ["cx:data", "cx:lvl", "cx:pt", "cx:series", "cx:dataPt"].includes(name)
  });
  var MAX_CHARTEX_POINTS = 1e4;
  function readLvl(lvl) {
    const parsed = parseInt(lvl?.["@_ptCount"], 10) || 0;
    const n = Math.min(Math.max(0, parsed), MAX_CHARTEX_POINTS);
    const out = Array.from({ length: n }, () => "");
    const ptsRaw = lvl?.["cx:pt"];
    const pts = Array.isArray(ptsRaw) ? ptsRaw : ptsRaw ? [ptsRaw] : [];
    for (const pt of pts) {
      const i = parseInt(pt?.["@_idx"], 10);
      if (!Number.isNaN(i) && i >= 0 && i < n)
        out[i] = typeof pt === "object" ? String(pt["#text"] ?? "") : "";
    }
    return out;
  }
  function collectAT(node) {
    const out = [];
    const walk = (n) => {
      if (n == null || typeof n !== "object") return;
      for (const [k, v] of Object.entries(n)) {
        if (k.startsWith("@_")) continue;
        if (k === "a:t") {
          for (const t of Array.isArray(v) ? v : [v]) {
            if (typeof t === "string") out.push(t);
            else if (t && typeof t === "object")
              out.push(String(t["#text"] ?? ""));
          }
        } else {
          for (const c of Array.isArray(v) ? v : [v]) walk(c);
        }
      }
    };
    walk(node);
    return out;
  }
  function parseChartExXml(xml, theme) {
    let doc;
    try {
      doc = cxParser.parse(xml);
    } catch {
      return null;
    }
    const space = doc["cx:chartSpace"];
    const region = space?.["cx:chart"]?.["cx:plotArea"]?.["cx:plotAreaRegion"];
    const seriesRaw = region?.["cx:series"];
    const ser = Array.isArray(seriesRaw) ? seriesRaw[0] : seriesRaw;
    const layoutId = ser?.["@_layoutId"];
    if (layoutId !== "funnel" && layoutId !== "sunburst") return null;
    const dataId = ser?.["cx:dataId"]?.["@_val"] ?? "0";
    const datas = space?.["cx:chartData"]?.["cx:data"] ?? [];
    const data = datas.find((d) => String(d?.["@_id"]) === String(dataId)) ?? datas[0];
    if (!data) return null;
    const strLvlsRaw = data["cx:strDim"]?.["cx:lvl"] ?? [];
    const strLvls = (Array.isArray(strLvlsRaw) ? strLvlsRaw : [strLvlsRaw]).map(readLvl);
    const numLvlRaw = data["cx:numDim"]?.["cx:lvl"];
    const numLvl = Array.isArray(numLvlRaw) ? numLvlRaw[0] : numLvlRaw;
    const values = readLvl(numLvl).map((v) => {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    });
    if (!values.some((v) => v != null)) return null;
    const model = {
      kind: layoutId,
      categories: strLvls[0] ?? [],
      series: [{ values }]
    };
    const title = space?.["cx:chart"]?.["cx:title"];
    if (title !== void 0) {
      model.title = collectAT(title?.["cx:tx"]).join("") || "Chart Title";
    }
    if (layoutId === "sunburst") {
      model.sunburst = { levels: strLvls, sizes: values };
      const dPtsRaw = ser?.["cx:dataPt"] ?? [];
      const dPts = Array.isArray(dPtsRaw) ? dPtsRaw : [dPtsRaw];
      const pointColors = [];
      for (const dPt of dPts) {
        const i = parseInt(dPt?.["@_idx"], 10);
        const c = resolveColorNode(dPt?.["cx:spPr"]?.["a:solidFill"], theme);
        if (!Number.isNaN(i) && c != null) pointColors[i] = c;
      }
      if (pointColors.length) model.sunburst.pointColors = pointColors;
    }
    if (layoutId === "funnel") {
      const gap = parseFloat(
        space?.["cx:chart"]?.["cx:plotArea"]?.["cx:axis"]?.["cx:catScaling"]?.["@_gapWidth"]
      );
      if (Number.isFinite(gap) && gap >= 0) model.gapWidthPct = gap * 100;
    }
    if (theme) {
      const accents = ["accent1", "accent2", "accent3", "accent4", "accent5", "accent6"].map((k) => theme.colors?.[k]).filter((c) => !!c);
      if (accents.length === 6) model.themePalette = accents;
    }
    return model;
  }

  // ../genoffice/packages/pptx-engine/src/custgeom.ts
  var TAG_RE2 = /<\/?(?:[^<>"']|"[^"]*"|'[^']*')*>/g;
  var NAME_RE2 = /^<\/?\s*([A-Za-z_][\w:.-]*)/;
  var ATTR_RE = /([\w:]+)\s*=\s*"([^"]*)"/g;
  function tagAttrs(tag) {
    const out = {};
    ATTR_RE.lastIndex = 0;
    let m;
    while (m = ATTR_RE.exec(tag)) out[m[1]] = m[2];
    return out;
  }
  var DEG = Math.PI / 180;
  var a2r = (v) => v / 6e4 * DEG;
  function evalGuides(gds, w, h) {
    const ss = Math.min(w, h);
    const env = {
      w,
      h,
      ss,
      ls: Math.max(w, h),
      hc: w / 2,
      vc: h / 2,
      l: 0,
      t: 0,
      r: w,
      b: h,
      wd2: w / 2,
      wd3: w / 3,
      wd4: w / 4,
      wd5: w / 5,
      wd6: w / 6,
      wd8: w / 8,
      wd10: w / 10,
      wd12: w / 12,
      wd32: w / 32,
      hd2: h / 2,
      hd3: h / 3,
      hd4: h / 4,
      hd5: h / 5,
      hd6: h / 6,
      hd8: h / 8,
      hd10: h / 10,
      hd12: h / 12,
      ssd2: ss / 2,
      ssd4: ss / 4,
      ssd6: ss / 6,
      ssd8: ss / 8,
      ssd16: ss / 16,
      ssd32: ss / 32,
      cd2: 108e5,
      cd4: 54e5,
      cd8: 27e5,
      "3cd4": 162e5,
      "3cd8": 81e5,
      "5cd8": 135e5,
      "7cd8": 189e5
    };
    const val = (tok) => {
      if (tok == null) return 0;
      const n = Number(tok);
      return Number.isFinite(n) ? n : env[tok] ?? 0;
    };
    for (const gd of gds) {
      const parts = gd.fmla.trim().split(/\s+/);
      const op = parts[0];
      const x = val(parts[1]);
      const y = val(parts[2]);
      const z = val(parts[3]);
      let out;
      switch (op) {
        case "val":
          out = x;
          break;
        case "*/":
          out = z === 0 ? 0 : x * y / z;
          break;
        case "+-":
          out = x + y - z;
          break;
        case "+/":
          out = z === 0 ? 0 : (x + y) / z;
          break;
        case "?:":
          out = x > 0 ? y : z;
          break;
        case "abs":
          out = Math.abs(x);
          break;
        case "min":
          out = Math.min(x, y);
          break;
        case "max":
          out = Math.max(x, y);
          break;
        case "pin":
          out = Math.min(Math.max(y, x), z);
          break;
        case "mod":
          out = Math.sqrt(x * x + y * y + z * z);
          break;
        case "sqrt":
          out = Math.sqrt(Math.max(x, 0));
          break;
        case "at2":
          out = Math.atan2(y, x) / DEG * 6e4;
          break;
        case "cat2":
          out = x * Math.cos(Math.atan2(z, y));
          break;
        case "sat2":
          out = x * Math.sin(Math.atan2(z, y));
          break;
        case "cos":
          out = x * Math.cos(a2r(y));
          break;
        case "sin":
          out = x * Math.sin(a2r(y));
          break;
        case "tan":
          out = x * Math.tan(a2r(y));
          break;
        default:
          out = 0;
      }
      env[gd.name] = out;
    }
    return env;
  }
  var CMD_PT_COUNT = {
    "a:moveTo": 1,
    "a:lnTo": 1,
    "a:quadBezTo": 2,
    "a:cubicBezTo": 3
  };
  var CMD_LETTER = {
    "a:moveTo": "M",
    "a:lnTo": "L",
    "a:quadBezTo": "Q",
    "a:cubicBezTo": "C"
  };
  function parseCustGeom(shapeXml, shapeW, shapeH) {
    const start = shapeXml.indexOf("<a:custGeom");
    if (start < 0) return void 0;
    const end = shapeXml.indexOf("</a:custGeom>", start);
    if (end < 0) return void 0;
    const xml = shapeXml.slice(start, end);
    const gds = [];
    const paths = [];
    let inGuides = false;
    let cur = null;
    let pending = null;
    TAG_RE2.lastIndex = 0;
    let m;
    while (m = TAG_RE2.exec(xml)) {
      const tag = m[0];
      if (tag.startsWith("<!--") || tag.startsWith("<![") || tag.startsWith("<?")) continue;
      const closing = tag.startsWith("</");
      const name = NAME_RE2.exec(tag)?.[1] ?? "";
      if (closing) {
        if (name === "a:avLst" || name === "a:gdLst") inGuides = false;
        else if (name === "a:path" && cur) {
          paths.push(cur);
          cur = null;
          pending = null;
        }
        continue;
      }
      const self2 = tag.endsWith("/>");
      switch (name) {
        case "a:avLst":
        case "a:gdLst":
          if (!self2) inGuides = true;
          break;
        case "a:gd": {
          if (!inGuides) break;
          const a = tagAttrs(tag);
          if (a.name && a.fmla) gds.push({ name: a.name, fmla: a.fmla });
          break;
        }
        case "a:path": {
          const a = tagAttrs(tag);
          cur = {
            w: a.w ? Number(a.w) || 0 : void 0,
            h: a.h ? Number(a.h) || 0 : void 0,
            fill: a.fill,
            stroke: a.stroke,
            cmds: []
          };
          if (self2) {
            paths.push(cur);
            cur = null;
          }
          break;
        }
        case "a:moveTo":
        case "a:lnTo":
        case "a:quadBezTo":
        case "a:cubicBezTo":
          if (cur) pending = { c: CMD_LETTER[name], need: CMD_PT_COUNT[name], pts: [] };
          break;
        case "a:pt": {
          if (!cur || !pending) break;
          const a = tagAttrs(tag);
          pending.pts.push([a.x ?? "0", a.y ?? "0"]);
          if (pending.pts.length >= pending.need) {
            cur.cmds.push({ c: pending.c, pts: pending.pts });
            pending = null;
          }
          break;
        }
        case "a:arcTo": {
          if (!cur) break;
          const a = tagAttrs(tag);
          cur.cmds.push({
            c: "A",
            arc: { wR: a.wR ?? "0", hR: a.hR ?? "0", stAng: a.stAng ?? "0", swAng: a.swAng ?? "0" }
          });
          break;
        }
        case "a:close":
          if (cur) cur.cmds.push({ c: "Z" });
          break;
      }
    }
    const env = evalGuides(gds, shapeW, shapeH);
    const resolve = (tok) => {
      const n = Number(tok);
      return Number.isFinite(n) ? n : env[tok] ?? 0;
    };
    const absList = paths.map((p) => toAbsCmds(p, resolve));
    let fw = 0;
    let fh = 0;
    paths.forEach((p, i) => {
      if (!p.w) fw = Math.max(fw, maxCoord(absList[i], 0));
      if (!p.h) fh = Math.max(fh, maxCoord(absList[i], 1));
    });
    const buckets = { path: [], fillPath: [], strokePath: [] };
    paths.forEach((p, i) => {
      const abs = absList[i];
      if (!abs.length) return;
      const vw = p.w || shapeW || fw || 1;
      const vh = p.h || shapeH || fh || 1;
      const d = emitNorm(abs, vw, vh);
      if (!d) return;
      const fillNone = p.fill === "none";
      const strokeNone = p.stroke === "0" || p.stroke === "false" || p.stroke === "none";
      if (fillNone && strokeNone) return;
      if (fillNone) buckets.strokePath.push(d);
      else if (strokeNone) buckets.fillPath.push(d);
      else buckets.path.push(d);
    });
    const out = {};
    if (buckets.path.length) out.path = buckets.path.join(" ");
    if (buckets.fillPath.length) out.fillPath = buckets.fillPath.join(" ");
    if (buckets.strokePath.length) out.strokePath = buckets.strokePath.join(" ");
    return out.path || out.fillPath || out.strokePath ? out : void 0;
  }
  function paramAngle(a, wR, hR) {
    if (wR === hR || !wR || !hR) return a;
    const t = Math.atan2(Math.sin(a) * wR, Math.cos(a) * hR);
    return t + 2 * Math.PI * Math.round((a - t) / (2 * Math.PI));
  }
  function toAbsCmds(p, resolve) {
    const out = [];
    let cx = 0;
    let cy = 0;
    let sx = 0;
    let sy = 0;
    for (const cmd of p.cmds) {
      if (cmd.c === "Z") {
        out.push({ c: "Z", xy: [] });
        cx = sx;
        cy = sy;
        continue;
      }
      if (cmd.c === "A") {
        const wR = resolve(cmd.arc.wR);
        const hR = resolve(cmd.arc.hR);
        const stRay = a2r(resolve(cmd.arc.stAng));
        const swRay = a2r(resolve(cmd.arc.swAng));
        if (swRay === 0) continue;
        const st = paramAngle(stRay, wR, hR);
        let sw = paramAngle(stRay + swRay, wR, hR) - st;
        sw += 2 * Math.PI * Math.round((swRay - sw) / (2 * Math.PI));
        const fullTurn = 2 * Math.PI;
        if (Math.abs(sw) > fullTurn) {
          sw = Math.sign(sw) * (fullTurn + Math.abs(sw) % fullTurn);
        }
        const ecx = cx - wR * Math.cos(st);
        const ecy = cy - hR * Math.sin(st);
        const segs = Math.max(1, Math.ceil(Math.abs(sw) / (Math.PI / 2)));
        const da = sw / segs;
        const k = 4 / 3 * Math.tan(da / 4);
        for (let i = 0; i < segs; i++) {
          const a1 = st + i * da;
          const a2 = a1 + da;
          const x1 = ecx + wR * Math.cos(a1);
          const y1 = ecy + hR * Math.sin(a1);
          const x2 = ecx + wR * Math.cos(a2);
          const y2 = ecy + hR * Math.sin(a2);
          out.push({
            c: "C",
            xy: [
              x1 - k * wR * Math.sin(a1),
              y1 + k * hR * Math.cos(a1),
              x2 + k * wR * Math.sin(a2),
              y2 - k * hR * Math.cos(a2),
              x2,
              y2
            ]
          });
          cx = x2;
          cy = y2;
        }
        continue;
      }
      const xy = [];
      for (const [xs, ys] of cmd.pts) {
        xy.push(resolve(xs), resolve(ys));
      }
      out.push({ c: cmd.c, xy });
      if (cmd.c === "M") {
        sx = xy[0];
        sy = xy[1];
      }
      cx = xy[xy.length - 2];
      cy = xy[xy.length - 1];
    }
    return out;
  }
  function maxCoord(cmds, axis) {
    let mx = 0;
    for (const c of cmds) for (let i = axis; i < c.xy.length; i += 2) mx = Math.max(mx, c.xy[i]);
    return mx;
  }
  function emitNorm(cmds, vw, vh) {
    const r5 = (v) => Math.round(v * 1e5) / 1e5;
    const parts = [];
    for (const c of cmds) {
      parts.push(c.c);
      for (let i = 0; i < c.xy.length; i += 2) {
        parts.push(String(r5(c.xy[i] / vw)), String(r5(c.xy[i + 1] / vh)));
      }
    }
    return parts.length ? parts.join(" ") : "";
  }

  // ../genoffice/packages/pptx-engine/src/table-style.ts
  var BUILTIN = {
    "{2D5ABB26-0587-4C30-8999-92F81FD0307C}": { family: "themed1" },
    "{3C2FFA5D-87B4-456A-9821-1D502468CF0F}": { family: "themed1", accent: "accent1" },
    "{284E427A-3D55-4303-BF80-6455036E1DE7}": { family: "themed1", accent: "accent2" },
    "{69C7853C-536D-4A76-A0AE-DD22124D55A5}": { family: "themed1", accent: "accent3" },
    "{775DCB02-9BB8-47FD-8907-85C794F793BA}": { family: "themed1", accent: "accent4" },
    "{35758FB7-9AC5-4552-8A53-C91805E547FA}": { family: "themed1", accent: "accent5" },
    "{08FB837D-C827-4EFA-A057-4D05807E0F7C}": { family: "themed1", accent: "accent6" },
    "{5940675A-B579-460E-94D1-54222C63F5DA}": { family: "themed2" },
    "{D113A9D2-9D6B-4929-AA2D-F23B5EE8CBE7}": { family: "themed2", accent: "accent1" },
    "{18603FDC-E32A-4AB5-989C-0864C3EAD2B8}": { family: "themed2", accent: "accent2" },
    "{306799F8-075E-4A3A-A7F6-7FBC6576F1A4}": { family: "themed2", accent: "accent3" },
    "{E269D01E-BC32-4049-B463-5C60D7B0CCD2}": { family: "themed2", accent: "accent4" },
    "{327F97BB-C833-4FB7-BDE5-3F7075034690}": { family: "themed2", accent: "accent5" },
    "{638B1855-1B75-4FBE-930C-398BA8C253C6}": { family: "themed2", accent: "accent6" },
    "{9D7B26C5-4107-4FEC-AEDC-1716B250A1EF}": { family: "light1" },
    "{3B4B98B0-60AC-42C2-AFA5-B58CD77FA1E5}": { family: "light1", accent: "accent1" },
    "{0E3FDE45-AF77-4B5C-9715-49D594BDF05E}": { family: "light1", accent: "accent2" },
    "{C083E6E3-FA7D-4D7B-A595-EF9225AFEA82}": { family: "light1", accent: "accent3" },
    "{D27102A9-8310-4765-A935-A1911B00CA55}": { family: "light1", accent: "accent4" },
    "{5FD0F851-EC5A-4D38-B0AD-8093EC10F338}": { family: "light1", accent: "accent5" },
    "{68D230F3-CF80-4859-8CE7-A43EE81993B5}": { family: "light1", accent: "accent6" },
    "{7E9639D4-E3E2-4D34-9284-5A2195B3D0D7}": { family: "light2" },
    "{69012ECD-51FC-41F1-AA8D-1B2483CD663E}": { family: "light2", accent: "accent1" },
    "{72833802-FEF1-4C79-8D5D-14CF1EAF98D9}": { family: "light2", accent: "accent2" },
    "{F2DE63D5-997A-4646-A377-4702673A728D}": { family: "light2", accent: "accent3" },
    "{17292A2E-F333-43FB-9621-5CBBE7FDCDCB}": { family: "light2", accent: "accent4" },
    "{5A111915-BE36-4E01-A7E5-04B1672EAD32}": { family: "light2", accent: "accent5" },
    "{912C8C85-51F0-491E-9774-3900AFEF0FD7}": { family: "light2", accent: "accent6" },
    "{616DA210-FB5B-4158-B5E0-FEB733F419BA}": { family: "light3" },
    "{BC89EF96-8CEA-46FF-86C4-4CE0E7609802}": { family: "light3", accent: "accent1" },
    "{5DA37D80-6434-44D0-A028-1B22A696006F}": { family: "light3", accent: "accent2" },
    "{8799B23B-EC83-4686-B30A-512413B5E67A}": { family: "light3", accent: "accent3" },
    "{ED083AE6-46FA-4A59-8FB0-9F97EB10719F}": { family: "light3", accent: "accent4" },
    "{BDBED569-4797-4DF1-A0F4-6AAB3CD982D8}": { family: "light3", accent: "accent5" },
    "{E8B1032C-EA38-4F05-BA0D-38AFFFC7BED3}": { family: "light3", accent: "accent6" },
    "{793D81CF-94F2-401A-BA57-92F5A7B2D0C5}": { family: "medium1" },
    "{B301B821-A1FF-4177-AEE7-76D212191A09}": { family: "medium1", accent: "accent1" },
    "{9DCAF9ED-07DC-4A11-8D7F-57B35C25682E}": { family: "medium1", accent: "accent2" },
    "{1FECB4D8-DB02-4DC6-A0A2-4F2EBAE1DC90}": { family: "medium1", accent: "accent3" },
    "{1E171933-4619-4E11-9A3F-F7608DF75F80}": { family: "medium1", accent: "accent4" },
    "{FABFCF23-3B69-468F-B69F-88F6DE6A72F2}": { family: "medium1", accent: "accent5" },
    "{10A1B5D5-9B99-4C35-A422-299274C87663}": { family: "medium1", accent: "accent6" },
    "{073A0DAA-6AF3-43AB-8588-CEC1D06C72B9}": { family: "medium2" },
    "{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}": { family: "medium2", accent: "accent1" },
    "{21E4AEA4-8DFA-4A89-87EB-49C32662AFE0}": { family: "medium2", accent: "accent2" },
    "{F5AB1C69-6EDB-4FF4-983F-18BD219EF322}": { family: "medium2", accent: "accent3" },
    "{00A15C55-8517-42AA-B614-E9B94910E393}": { family: "medium2", accent: "accent4" },
    "{7DF18680-E054-41AD-8BC1-D1AEF772440D}": { family: "medium2", accent: "accent5" },
    "{93296810-A885-4BE3-A3E7-6D5BEEA58F35}": { family: "medium2", accent: "accent6" },
    "{8EC20E35-A176-4012-BC5E-935CFFF8708E}": { family: "medium3" },
    "{6E25E649-3F16-4E02-A733-19D2CDBF48F0}": { family: "medium3", accent: "accent1" },
    "{85BE263C-DBD7-4A20-BB59-AAB30ACAA65A}": { family: "medium3", accent: "accent2" },
    "{EB344D84-9AFB-497E-A393-DC336BA19D2E}": { family: "medium3", accent: "accent3" },
    "{EB9631B5-78F2-41C9-869B-9F39066F8104}": { family: "medium3", accent: "accent4" },
    "{74C1A8A3-306A-4EB7-A6B1-4F7E0EB9C5D6}": { family: "medium3", accent: "accent5" },
    "{2A488322-F2BA-4B5B-9748-0D474271808F}": { family: "medium3", accent: "accent6" },
    "{D7AC3CCA-C797-4891-BE02-D94E43425B78}": { family: "medium4" },
    "{69CF1AB2-1976-4502-BF36-3FF5EA218861}": { family: "medium4", accent: "accent1" },
    "{8A107856-5554-42FB-B03E-39F5DBC370BA}": { family: "medium4", accent: "accent2" },
    "{0505E3EF-67EA-436B-97B2-0124C06EBD24}": { family: "medium4", accent: "accent3" },
    "{C4B1156A-380E-4F78-BDF5-A606A8083BF9}": { family: "medium4", accent: "accent4" },
    "{22838BEF-8BB2-4498-84A7-C5851F593DF1}": { family: "medium4", accent: "accent5" },
    "{16D9F66E-5EB9-4882-86FB-DCBF35E3C3E4}": { family: "medium4", accent: "accent6" },
    "{E8034E78-7F5D-4C2E-B375-FC64B27BC917}": { family: "dark1" },
    "{125E5076-3810-47DD-B79F-674D7AD40C01}": { family: "dark1", accent: "accent1" },
    "{37CE84F3-28C3-443E-9E96-99CF82512B78}": { family: "dark1", accent: "accent2" },
    "{D03447BB-5D67-496B-8E87-E561075AD55C}": { family: "dark1", accent: "accent3" },
    "{E929F9F4-4A8F-4326-A1B4-22849713DDAB}": { family: "dark1", accent: "accent4" },
    "{8FD4443E-F989-4FC4-A0C8-D5A2AF1F390B}": { family: "dark1", accent: "accent5" },
    "{AF606853-7671-496A-8E4F-DF71F8EC918B}": { family: "dark1", accent: "accent6" },
    "{5202B0CA-FC54-4496-8BCA-5EF66A818D29}": { family: "dark2" },
    "{0660B408-B3CF-4A94-85FC-2B1E0A45F4A2}": { family: "dark2", accent: "accent1" },
    "{91EBBBCC-DAD2-459C-BE2E-F6DE35CF9A28}": { family: "dark2", accent: "accent3" },
    "{46F890A9-2807-4EBB-B81D-B2AA78EC7F39}": { family: "dark2", accent: "accent5" }
  };
  var FAMILY_LABEL = {
    themed1: "Themed Style 1",
    themed2: "Themed Style 2",
    light1: "Light Style 1",
    light2: "Light Style 2",
    light3: "Light Style 3",
    medium1: "Medium Style 1",
    medium2: "Medium Style 2",
    medium3: "Medium Style 3",
    medium4: "Medium Style 4",
    dark1: "Dark Style 1",
    dark2: "Dark Style 2"
  };
  function builtinName(family, accent) {
    if (!accent) {
      if (family === "themed1") return "No Style, No Grid";
      if (family === "themed2") return "No Style, Table Grid";
      return FAMILY_LABEL[family];
    }
    const n = accent.slice("accent".length);
    if (family === "dark2") return `${FAMILY_LABEL[family]} - Accent ${n}/Accent ${Number(n) + 1}`;
    return `${FAMILY_LABEL[family]} - Accent ${n}`;
  }
  var BUILTIN_TABLE_STYLES = Object.entries(BUILTIN).map(
    ([id, def]) => ({
      id,
      name: builtinName(def.family, def.accent),
      family: def.family,
      ...def.accent ? { accent: def.accent } : {}
    })
  );
  var LEGACY_NO_STYLE = "{2D5ABB26-0587-4C30-8999-92F81FD0307D}";
  function tint(hex, pct) {
    return mixToward(hex, pct, 255);
  }
  function shade(hex, pct) {
    return mixToward(hex, pct, 0);
  }
  function mixToward(hex, pct, target) {
    const h = hex.replace("#", "");
    const ch = (i) => parseInt(h.slice(i, i + 2), 16);
    const mix = (c) => Math.round(target * (1 - pct) + c * pct);
    const to = (c) => c.toString(16).toUpperCase().padStart(2, "0");
    return `#${to(mix(ch(0)))}${to(mix(ch(2)))}${to(mix(ch(4)))}`;
  }
  function over(fg, alpha, bg) {
    const f = fg.replace("#", "");
    const b = bg.replace("#", "");
    const ch = (s, i) => parseInt(s.slice(i, i + 2), 16);
    const mix = (i) => Math.round(ch(f, i) * alpha + ch(b, i) * (1 - alpha));
    const to = (c) => c.toString(16).toUpperCase().padStart(2, "0");
    return `#${to(mix(0))}${to(mix(2))}${to(mix(4))}`;
  }
  var solid = (color) => ({ type: "solid", color });
  var line = (color, width = 12700) => ({ fill: solid(color), width });
  function builtinStyle(family, accentName, theme) {
    const lt1 = resolveSchemeColor("lt1", theme) ?? "#FFFFFF";
    const dk1 = resolveSchemeColor("dk1", theme) ?? "#000000";
    const accent = accentName ? resolveSchemeColor(accentName, theme) ?? "#4472C4" : void 0;
    switch (family) {
      case "themed1": {
        if (!accent) return { wholeTbl: { textColor: dk1 } };
        const band = solid(over(accent, 0.4, lt1));
        return {
          wholeTbl: { textColor: dk1 },
          firstRow: { fill: solid(accent), textColor: lt1 },
          band1H: { fill: band },
          band1V: { fill: band },
          insideH: line(accent),
          insideV: line(accent),
          outer: { l: line(accent), r: line(accent), t: line(accent), b: line(accent) },
          firstRowBottom: line(lt1)
        };
      }
      case "themed2": {
        if (!accent) {
          return {
            wholeTbl: { textColor: dk1 },
            insideH: line(dk1),
            insideV: line(dk1),
            outer: { l: line(dk1), r: line(dk1), t: line(dk1), b: line(dk1) }
          };
        }
        const outer = line(tint(accent, 0.5));
        const band = solid(over(lt1, 0.2, accent));
        return {
          wholeTbl: { fill: solid(accent), textColor: lt1 },
          band1H: { fill: band },
          band1V: { fill: band },
          outer: { l: outer, r: outer, t: outer, b: outer },
          firstRowBottom: line(lt1),
          lastRowTop: line(lt1)
        };
      }
      case "light1": {
        const a = accent ?? dk1;
        const band = solid(over(a, 0.2, lt1));
        return {
          wholeTbl: { textColor: dk1 },
          firstRow: { bold: true, textColor: dk1 },
          firstCol: { bold: true },
          lastCol: { bold: true, textColor: dk1 },
          band1H: { fill: band },
          band1V: { fill: band },
          outer: { t: line(a), b: line(a) },
          firstRowBottom: line(a),
          lastRowTop: line(a)
        };
      }
      case "light2": {
        const a = accent ?? dk1;
        return {
          wholeTbl: { textColor: dk1 },
          firstRow: { fill: solid(a), textColor: lt1, bold: true },
          outer: { l: line(a), r: line(a), t: line(a), b: line(a) },
          lastRowTop: line(a)
        };
      }
      case "light3": {
        const a = accent ?? dk1;
        const band = solid(over(a, 0.2, lt1));
        return {
          wholeTbl: { textColor: dk1 },
          firstRow: { textColor: a, bold: true },
          band1H: { fill: band },
          band1V: { fill: band },
          insideH: line(a),
          insideV: line(a),
          outer: { l: line(a), r: line(a), t: line(a), b: line(a) },
          firstRowBottom: line(a),
          lastRowTop: line(a)
        };
      }
      case "medium1": {
        const a = accent ?? dk1;
        const band = solid(tint(a, 0.2));
        return {
          wholeTbl: { fill: solid(lt1), textColor: dk1 },
          firstRow: { fill: solid(a), textColor: lt1, bold: true },
          lastRow: { fill: solid(lt1), bold: true },
          band1H: { fill: band },
          band1V: { fill: band },
          insideH: line(a),
          outer: { l: line(a), r: line(a), t: line(a), b: line(a) },
          lastRowTop: line(a)
        };
      }
      case "medium2": {
        const a = accent ?? dk1;
        return {
          wholeTbl: { fill: solid(tint(a, 0.2)), textColor: dk1 },
          band1H: { fill: solid(tint(a, 0.4)) },
          band1V: { fill: solid(tint(a, 0.4)) },
          firstRow: { fill: solid(a), textColor: lt1, bold: true },
          lastRow: { fill: solid(a), textColor: lt1, bold: true },
          firstCol: { fill: solid(a), textColor: lt1, bold: true },
          lastCol: { fill: solid(a), textColor: lt1, bold: true },
          insideH: line(lt1),
          insideV: line(lt1),
          outer: { l: line(lt1), r: line(lt1), t: line(lt1), b: line(lt1) },
          firstRowBottom: line(lt1),
          lastRowTop: line(lt1)
        };
      }
      case "medium3": {
        const a = accent ?? dk1;
        const band = solid(tint(dk1, 0.2));
        return {
          wholeTbl: { fill: solid(lt1), textColor: dk1 },
          firstRow: { fill: solid(a), textColor: lt1, bold: true },
          lastRow: { fill: solid(lt1), bold: true },
          firstCol: { fill: solid(a), textColor: lt1 },
          lastCol: { fill: solid(a), textColor: lt1 },
          band1H: { fill: band },
          band1V: { fill: band },
          outer: { t: line(dk1), b: line(dk1) },
          firstRowBottom: line(dk1),
          lastRowTop: line(dk1)
        };
      }
      case "medium4": {
        const a = accent ?? dk1;
        const band = solid(tint(a, 0.4));
        return {
          wholeTbl: { fill: solid(tint(a, 0.2)), textColor: dk1 },
          firstRow: { fill: solid(tint(a, 0.2)), textColor: a, bold: true },
          lastRow: { fill: solid(tint(dk1, 0.2)) },
          band1H: { fill: band },
          band1V: { fill: band },
          insideH: line(a),
          insideV: line(a),
          outer: { l: line(a), r: line(a), t: line(a), b: line(a) },
          lastRowTop: line(dk1)
        };
      }
      case "dark1": {
        const a = accent ?? dk1;
        const tf = accent ? shade : tint;
        const body = accent ? lt1 : dk1;
        return {
          wholeTbl: { fill: solid(tf(a, 0.2)), textColor: body },
          firstRow: { fill: solid(dk1), textColor: lt1, bold: true },
          lastRow: { fill: solid(tf(a, 0.2)), textColor: body, bold: true },
          firstCol: { fill: solid(tf(a, 0.6)) },
          lastCol: { fill: solid(tf(a, 0.6)) },
          band1H: { fill: solid(tf(a, 0.4)) },
          band1V: { fill: solid(tf(a, 0.4)) },
          firstRowBottom: line(lt1),
          lastRowTop: line(lt1)
        };
      }
      case "dark2": {
        const a = accent ?? dk1;
        const headerPair = {
          accent1: "accent2",
          accent3: "accent4",
          accent5: "accent6"
        };
        const header = accentName ? resolveSchemeColor(headerPair[accentName] ?? accentName, theme) ?? dk1 : dk1;
        const band = solid(tint(a, 0.4));
        return {
          wholeTbl: { fill: solid(tint(a, 0.2)), textColor: dk1 },
          firstRow: { fill: solid(header), textColor: lt1, bold: true },
          lastRow: { fill: solid(tint(a, 0.2)), bold: true },
          band1H: { fill: band },
          band1V: { fill: band },
          lastRowTop: line(dk1)
        };
      }
    }
  }
  function resolveTableStyle(styleId, tableStylesXml, theme) {
    if (!styleId) return void 0;
    if (tableStylesXml && tableStylesXml.includes(styleId)) {
      const def = parseTableStylesXml(tableStylesXml, styleId, theme);
      if (def) return def;
    }
    const builtin = BUILTIN[styleId];
    if (builtin) return builtinStyle(builtin.family, builtin.accent, theme);
    if (styleId === LEGACY_NO_STYLE) return {};
    return void 0;
  }
  function cellStyleBorders(def, flags, r, c, nRows, nCols) {
    const out = {};
    if (r < nRows - 1 && def.insideH) out.b = def.insideH;
    if (c < nCols - 1 && def.insideV) out.r = def.insideV;
    if (def.outer) {
      if (r === 0 && def.outer.t) out.t = def.outer.t;
      if (r === nRows - 1 && def.outer.b) out.b = def.outer.b;
      if (c === 0 && def.outer.l) out.l = def.outer.l;
      if (c === nCols - 1 && def.outer.r) out.r = def.outer.r;
    }
    if (flags.firstRow && r === 0 && nRows > 1 && def.firstRowBottom) out.b = def.firstRowBottom;
    if (flags.lastRow && r === nRows - 1 && nRows > 1 && def.lastRowTop) out.t = def.lastRowTop;
    return out;
  }
  var tsParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    isArray: (name) => name === "a:tblStyle"
  });
  function readColor(node, theme) {
    if (!node || typeof node !== "object") return void 0;
    const n = asXmlNode(node);
    if (n["a:srgbClr"]) {
      const srgb = asXmlNode(n["a:srgbClr"]);
      return applyColorMods("#" + String(srgb["@_val"]).toUpperCase(), srgb);
    }
    if (n["a:schemeClr"]) {
      const scheme = asXmlNode(n["a:schemeClr"]);
      const base = resolveSchemeColor(String(scheme["@_val"]), theme);
      if (!base) return void 0;
      return applyColorMods(base, scheme);
    }
    const prst = asXmlNode(n["a:prstClr"])["@_val"];
    if (prst === "black") return "#000000";
    if (prst === "white") return "#FFFFFF";
    return void 0;
  }
  function readPart(part, theme) {
    if (!part || typeof part !== "object") return void 0;
    const p = asXmlNode(part);
    const out = {};
    const fillColor = readColor(asXmlNode(asXmlNode(p["a:tcStyle"])["a:fill"])["a:solidFill"], theme);
    if (fillColor) out.fill = solid(fillColor);
    if (p["a:tcTxStyle"]) {
      const tx = asXmlNode(p["a:tcTxStyle"]);
      if (tx["@_b"] === "on") out.bold = true;
      const c = readColor(tx, theme);
      if (c) out.textColor = c;
    }
    return Object.keys(out).length ? out : void 0;
  }
  function readInside(part, tag, theme) {
    const bdr = asXmlNode(asXmlNode(asXmlNode(part)["a:tcStyle"])["a:tcBdr"]);
    const edge = asXmlNode(bdr[tag]);
    const lnRaw = edge["a:ln"];
    if (lnRaw) {
      const ln = asXmlNode(lnRaw);
      if ("a:noFill" in ln) return void 0;
      const c = readColor(ln["a:solidFill"], theme);
      if (!c) return void 0;
      return line(c, parseInt(String(ln["@_w"]), 10) || 12700);
    }
    const refRaw = edge["a:lnRef"];
    if (refRaw) {
      const ref = asXmlNode(refRaw);
      const c = readColor(ref, theme);
      if (!c) return void 0;
      const idx = parseInt(String(ref["@_idx"] ?? "0"), 10) || 0;
      const tplLn = asXmlNode(asXmlNode(theme?.lnStyles?.[idx - 1])["a:ln"]);
      return line(c, parseInt(String(tplLn["@_w"]), 10) || 12700);
    }
    return void 0;
  }
  function parseTableStylesXml(xml, styleId, theme) {
    let doc;
    try {
      doc = asXmlNode(tsParser.parse(xml));
    } catch {
      return void 0;
    }
    const list = asXmlNode(doc["a:tblStyleLst"])["a:tblStyle"] ?? [];
    const style = xmlArray(list).find((s) => s["@_styleId"] === styleId);
    if (!style) return void 0;
    const def = {};
    const tblBgRaw = style["a:tblBg"];
    if (tblBgRaw) {
      const bg = asXmlNode(tblBgRaw);
      const direct = readColor(asXmlNode(bg["a:fill"])["a:solidFill"], theme);
      if (direct) def.tblBg = solid(direct);
      const refRaw = bg["a:fillRef"];
      if (refRaw) {
        const ref = asXmlNode(refRaw);
        const idx = parseInt(String(ref["@_idx"] ?? "0"), 10) || 0;
        if (idx > 0) def.tblBgRef = { idx, phClr: readColor(ref, theme) };
      }
    }
    for (const key of [
      "wholeTbl",
      "band1H",
      "band2H",
      "band1V",
      "band2V",
      "firstRow",
      "lastRow",
      "firstCol",
      "lastCol"
    ]) {
      const p = readPart(style["a:" + key], theme);
      if (p) def[key] = p;
    }
    def.insideH = readInside(style["a:wholeTbl"], "a:insideH", theme);
    def.insideV = readInside(style["a:wholeTbl"], "a:insideV", theme);
    if (!def.insideH) delete def.insideH;
    if (!def.insideV) delete def.insideV;
    const outer = {
      l: readInside(style["a:wholeTbl"], "a:left", theme),
      r: readInside(style["a:wholeTbl"], "a:right", theme),
      t: readInside(style["a:wholeTbl"], "a:top", theme),
      b: readInside(style["a:wholeTbl"], "a:bottom", theme)
    };
    if (outer.l || outer.r || outer.t || outer.b) def.outer = outer;
    return Object.keys(def).length ? def : void 0;
  }
  function cellPartStyle(def, flags, r, c, nRows, nCols) {
    const merge = (base, over2) => over2 ? { ...base, ...Object.fromEntries(Object.entries(over2).filter(([, v]) => v !== void 0)) } : base;
    let out = { ...def.wholeTbl ?? {} };
    const isFirstRow = flags.firstRow && r === 0;
    const isLastRow = flags.lastRow && r === nRows - 1;
    const isFirstCol = flags.firstCol && c === 0;
    const isLastCol = flags.lastCol && c === nCols - 1;
    if (flags.bandRow && !isFirstRow && !isLastRow) {
      const dataR = r - (flags.firstRow ? 1 : 0);
      out = merge(out, dataR % 2 === 0 ? def.band1H : def.band2H);
    }
    if (flags.bandCol && !isFirstCol && !isLastCol) {
      const dataC = c - (flags.firstCol ? 1 : 0);
      out = merge(out, dataC % 2 === 0 ? def.band1V : def.band2V);
    }
    if (isLastCol) out = merge(out, def.lastCol);
    if (isFirstCol) out = merge(out, def.firstCol);
    if (isLastRow) out = merge(out, def.lastRow);
    if (isFirstRow) out = merge(out, def.firstRow);
    return out;
  }

  // ../genoffice/packages/pptx-engine/src/parse.ts
  var parser2 = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    // Text fidelity: no trim (leading/trailing spaces in runs matter, e.g. "bold word " + following text),
    // no numeric coercion of tag values (otherwise <a:t>2026</a:t> becomes a number and downstream string reads lose characters)
    trimValues: false,
    parseTagValue: false,
    // Order preservation is not the point (semantic tree); keep array structure for multiple runs/paragraphs
    isArray: (name) => [
      "a:p",
      "a:r",
      "a:br",
      "a:fld",
      "p:sp",
      "p:pic",
      "p:graphicFrame",
      "p:grpSp",
      "p:cxnSp",
      "a:tr",
      "a:tc",
      "a:gridCol"
    ].includes(name)
    // spTree children nested in groups also need arrays (covered above)
  });
  var DEFAULT_BODY_INSETS = { l: 91440, t: 45720, r: 91440, b: 45720 };
  var uidCounter = 0;
  function uid(prefix) {
    return `${prefix}_${(uidCounter++).toString(36)}`;
  }
  function parseSlide(input) {
    const { slideXml, path, layoutPath, masterPath, ctx } = input;
    const scan = scanSlide(slideXml);
    const elements = [];
    scan.elements.forEach((sp, idx) => {
      const fragXml = slideXml.slice(sp.start, sp.end);
      const anchor = {
        spIndex: idx,
        originalXml: fragXml,
        range: [sp.start, sp.end],
        ...sp.gapAfter ? { gapAfter: sp.gapAfter } : {}
      };
      const el = parseShapeFragment(sp, fragXml, anchor, ctx);
      if (el) elements.push(el);
    });
    const ownBackground = parseBackground(slideXml, ctx);
    const defaultBg1 = resolveSchemeColor("bg1", ctx.theme);
    const background = ownBackground ?? (ctx.layoutBg ? parseBackground(ctx.layoutBg, { ...ctx, mediaRels: ctx.layoutMediaRels ?? ctx.mediaRels }) : void 0) ?? (ctx.masterBg ? parseBackground(ctx.masterBg, { ...ctx, mediaRels: ctx.masterMediaRels ?? ctx.mediaRels }) : void 0) ?? (defaultBg1 && defaultBg1.toUpperCase() !== "#FFFFFF" ? { type: "solid", color: defaultBg1 } : void 0);
    const masterSpHidden = /<p:sld\b[^>]*\bshowMasterSp=(?:"(?:0|false)"|'(?:0|false)')/.test(
      slideXml
    );
    return {
      path,
      originalXml: slideXml,
      bodyPrefix: scan.bodyPrefix,
      bodySuffix: scan.bodySuffix,
      elements,
      layoutPath,
      masterPath,
      ...background ? { background } : {},
      ...ownBackground || /<p:bg[\s>]/.test(slideXml) ? { bgOwn: true } : {},
      ...masterSpHidden ? { masterSpHidden: true } : {}
    };
  }
  function parseBackground(xml, ctx) {
    const m = /<p:bg\b[\s\S]*?<\/p:bg>/.exec(xml);
    if (!m) return void 0;
    let doc;
    try {
      doc = parser2.parse(m[0]);
    } catch {
      return void 0;
    }
    const bg = doc["p:bg"];
    const bgPr = bg?.["p:bgPr"];
    if (bgPr) {
      return parseFill(bgPr, ctx);
    }
    const bgRef = bg?.["p:bgRef"];
    if (bgRef) {
      const color = resolveColorNode2(bgRef, ctx);
      const idx = parseInt(String(bgRef["@_idx"] ?? ""), 10);
      const tpl = idx >= 1001 ? ctx.theme?.bgFillStyles?.[idx - 1001] : idx >= 1 ? ctx.theme?.fillStyles?.[idx - 1] : void 0;
      if (tpl) {
        const fill = parseFill(tpl, {
          ...ctx,
          phClr: color,
          mediaRels: ctx.themeMediaRels ?? ctx.mediaRels
        });
        if (fill) return fill;
      }
      if (color) return { type: "solid", color };
    }
    return void 0;
  }
  var NV_PR_KEYS = {
    "p:sp": "p:nvSpPr",
    "p:pic": "p:nvPicPr",
    "p:grpSp": "p:nvGrpSpPr",
    "p:graphicFrame": "p:nvGraphicFramePr",
    "p:cxnSp": "p:nvCxnSpPr"
  };
  function isHiddenElement(node, tagName) {
    const nvKey = NV_PR_KEYS[tagName];
    if (!nvKey) return false;
    const hidden = node?.[nvKey]?.["p:cNvPr"]?.["@_hidden"];
    return hidden === "1" || hidden === "true";
  }
  var MATH_AC_RE = /<mc:AlternateContent\b[^>]*>\s*<mc:Choice\b[^>]*>\s*<a14:m\b[\s\S]*?<\/mc:AlternateContent>/g;
  function mathBlockAsRun(block) {
    const fallback = /<mc:Fallback\b[^>]*>([\s\S]*?)<\/mc:Fallback>/.exec(block)?.[1] ?? "";
    const texts = (m) => [...m.matchAll(/<(?:a|m):t(?:\s[^>]*)?>([\s\S]*?)<\/(?:a|m):t>/g)].map((x) => x[1]).join("");
    const text = texts(fallback) || texts(block);
    return `<a:r gxRaw="${utf8ToBase64(block)}"><a:rPr/><a:t>${text}</a:t></a:r>`;
  }
  function utf8ToBase64(s) {
    const bytes = new TextEncoder().encode(s);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 32768)
      bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(bin);
  }
  function base64ToUtf8(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function parseShapeFragment(sp, fragXml, anchor, ctx) {
    const semanticXml = fragXml.replace(MATH_AC_RE, mathBlockAsRun).replace(/<a:br\b[^>]*\/>|<a:br\b[\s\S]*?<\/a:br>/g, "<a:r><a:t>\n</a:t></a:r>").replace(/<a:fld\b/g, "<a:r").replace(/<\/a:fld>/g, "</a:r>");
    if (sp.name === "p:grpSp" && groupExceedsBudget(fragXml)) {
      return passthrough(anchor, "unknown", void 0);
    }
    let doc;
    try {
      doc = parser2.parse(semanticXml);
    } catch (err) {
      if (sp.name === "p:grpSp") return passthrough(anchor, "unknown", void 0);
      throw err;
    }
    const node = doc[sp.name] ? Array.isArray(doc[sp.name]) ? doc[sp.name][0] : doc[sp.name] : null;
    if (!node) return null;
    if (isHiddenElement(node, sp.name)) {
      const silent = passthrough(anchor, "unknown", node);
      silent.noChip = true;
      return silent;
    }
    switch (sp.name) {
      case "p:sp":
        return parseSpShape(node, anchor, ctx, fragXml);
      case "p:pic":
        return parsePicture(node, anchor, ctx, fragXml);
      case "p:grpSp":
        return parseGroup(node, anchor, ctx, fragXml);
      case "p:graphicFrame":
        return graphicFramePassthrough(node, anchor, ctx);
      case "p:cxnSp":
        return parseConnector(node, anchor, ctx);
      case "mc:AlternateContent": {
        const choicesRaw = node["mc:Choice"];
        const choices = Array.isArray(choicesRaw) ? choicesRaw : choicesRaw ? [choicesRaw] : [];
        for (const ch of choices) {
          const gfRaw = ch?.["p:graphicFrame"];
          const gf = Array.isArray(gfRaw) ? gfRaw[0] : gfRaw;
          if (!gf) continue;
          const el = graphicFramePassthrough(gf, anchor, ctx);
          if (el && el.type !== "passthrough") return el;
        }
        const fb = node["mc:Fallback"];
        const picRaw = fb?.["p:pic"];
        const pic = Array.isArray(picRaw) ? picRaw[0] : picRaw;
        if (pic) {
          const el = parsePicture(pic, anchor, ctx);
          const inkXfrm = choices.map((ch) => {
            const cp = ch?.["p:contentPart"];
            return (Array.isArray(cp) ? cp[0] : cp)?.["p14:xfrm"];
          }).find(Boolean);
          if (inkXfrm) el.transform = parseXfrm(inkXfrm);
          return el;
        }
        const spRaw = fb?.["p:sp"];
        const sp2 = Array.isArray(spRaw) ? spRaw[0] : spRaw;
        if (sp2) return parseSpShape(sp2, anchor, ctx);
        const silent = passthrough(anchor, "unknown", node);
        silent.noChip = true;
        return silent;
      }
      default:
        return passthrough(anchor, "unknown", node);
    }
  }
  function parseSpShape(node, anchor, ctx, rawXml) {
    const spPr = node["p:spPr"] ?? {};
    const nv = node["p:nvSpPr"];
    const ph = nv?.["p:nvPr"]?.["p:ph"];
    const phType = ph?.["@_type"];
    const phIdx = ph?.["@_idx"] != null ? String(ph["@_idx"]) : void 0;
    const name = nv?.["p:cNvPr"]?.["@_name"];
    let transform = parseXfrm(spPr["a:xfrm"]);
    if (ph && !spPr["a:xfrm"]) {
      const inherited = resolvePlaceholderTransform(
        ctx.layoutPlaceholders,
        ctx.masterPlaceholders,
        phType,
        phIdx
      );
      if (inherited) transform = inherited;
    }
    const prstGeom = spPr["a:prstGeom"];
    const presetGeometry = prstGeom?.["@_prst"];
    const adjust = parseAvLst(prstGeom?.["a:avLst"]);
    const customGeometry = spPr["a:custGeom"] != null ? parseCustGeom(rawXml || anchor.originalXml, transform.offset.cx, transform.offset.cy) : void 0;
    let fill = parseFill(spPr, ctx);
    const txBody = node["p:txBody"];
    const phChain = ph ? placeholderStyleChain(
      ctx.layoutPlaceholders,
      ctx.masterPlaceholders,
      ctx.masterTextStyles,
      phType,
      phIdx
    ) : ctx.defaultTextStyle ? [{ ...ctx.defaultTextStyle, src: "presentation defaultTextStyle" }] : [];
    const fontRefColor = resolveColorNode2(node["p:style"]?.["a:fontRef"], ctx);
    const chainLayers = fontRefColor ? [{ levels: [{ color: fontRefColor }], src: "shape style" }, ...phChain] : phChain;
    const phInsets = ph ? resolvePlaceholderInsets(ctx.layoutPlaceholders, ctx.masterPlaceholders, phType, phIdx) : void 0;
    const text = txBody ? parseTextBody(txBody, ctx, chainLayers, phInsets) : void 0;
    if (ph && text && !text.anchor) {
      const inherited = resolvePlaceholderAnchor(
        ctx.layoutPlaceholders,
        ctx.masterPlaceholders,
        phType,
        phIdx
      );
      if (inherited) text.anchor = inherited;
    }
    if (ph && text && text.anchorCtr == null) {
      const inherited = resolvePlaceholderAnchorCtr(
        ctx.layoutPlaceholders,
        ctx.masterPlaceholders,
        phType,
        phIdx
      );
      if (inherited != null) text.anchorCtr = inherited;
    }
    let stroke = parseStroke(spPr, ctx);
    let shadow = parseShadow(spPr, ctx);
    let glow = parseGlow(spPr, ctx);
    const reflection = parseReflection(spPr);
    const scene3d = parseScene3D(spPr, ctx);
    const softEdgeRad = spPr?.["a:effectLst"]?.["a:softEdge"]?.["@_rad"];
    const overlayNode = spPr?.["a:effectLst"]?.["a:fillOverlay"];
    const fillOverlay = overlayNode ? parseFill(overlayNode, ctx) : void 0;
    const style = node["p:style"];
    if (style && typeof style === "object") {
      if (fill === void 0) {
        const ref = style["a:fillRef"];
        const idx = parseInt(String(ref?.["@_idx"] ?? "0"), 10) || 0;
        const phClr = resolveColorNode2(ref, ctx);
        if (idx > 0) {
          const tpl = idx > 1e3 ? ctx.theme?.bgFillStyles?.[idx - 1001] : ctx.theme?.fillStyles?.[idx - 1];
          const tplFill = tpl ? parseFill(tpl, { ...ctx, phClr, mediaRels: ctx.themeMediaRels ?? ctx.mediaRels }) : void 0;
          fill = tplFill ?? (phClr ? { type: "solid", color: phClr } : void 0);
        }
      }
      if (stroke === void 0) stroke = styleRefStroke(node, ctx);
      if (!shadow && !glow) {
        const ref = style["a:effectRef"];
        const idx = parseInt(String(ref?.["@_idx"] ?? "0"), 10) || 0;
        const phClr = resolveColorNode2(ref, ctx);
        const es = idx > 0 ? ctx.theme?.effectStyles?.[idx - 1]?.["a:effectStyle"] : void 0;
        if (es) {
          const tplCtx = { ...ctx, phClr };
          shadow = parseShadow(es, tplCtx);
          glow = parseGlow(es, tplCtx);
        }
      }
      const fontColor = resolveColorNode2(style["a:fontRef"], ctx);
      if (fontColor && text) {
        for (const p of text.paragraphs) {
          for (const r of p.runs) if (!r.color) r.color = fontColor;
        }
      }
    }
    if (fill === void 0 && ph) {
      const inh = resolvePlaceholderFillSpPr(
        ctx.layoutPlaceholders,
        ctx.masterPlaceholders,
        phType,
        phIdx
      );
      if (inh) {
        fill = parseFill(inh.spPr, {
          ...ctx,
          mediaRels: (inh.layer === "layout" ? ctx.layoutMediaRels : ctx.masterMediaRels) ?? ctx.mediaRels
        });
      }
    }
    const el = {
      id: uid("sp"),
      type: txBody && !presetGeometry && !customGeometry ? "text" : "shape",
      anchor,
      transform,
      // <p:ph> without a type (content placeholder) defaults to body per ECMA
      placeholder: ph ? phType ?? "body" : void 0,
      ...nv?.["p:cNvSpPr"]?.["@_txBox"] === "1" ? { txBox: true } : {},
      name,
      presetGeometry,
      ...adjust ? { adjust } : {},
      ...customGeometry ? { customGeometry } : {},
      ...!presetGeometry && !customGeometry && !ph ? { noGeometry: true } : {},
      fill,
      ...node["@_useBgFill"] === "1" || node["@_useBgFill"] === "true" ? { useBgFill: true } : {},
      ...fillOverlay && fillOverlay.type !== "none" ? { fillOverlay } : {},
      ...stroke ? { stroke } : {},
      ...shadow ? { shadow } : {},
      ...glow ? { glow } : {},
      ...reflection ? { reflection } : {},
      ...scene3d ? { scene3d } : {},
      ...softEdgeRad != null ? { softEdge: intOr(softEdgeRad, 0) } : {},
      text
    };
    return el;
  }
  function styleRefStroke(node, ctx) {
    const ref = node?.["p:style"]?.["a:lnRef"];
    const idx = parseInt(String(ref?.["@_idx"] ?? "0"), 10) || 0;
    if (idx <= 0) return void 0;
    const phClr = resolveColorNode2(ref, ctx);
    const tpl = ctx.theme?.lnStyles?.[idx - 1];
    return (tpl ? parseStroke(tpl, { ...ctx, phClr }) : void 0) ?? (phClr ? { fill: { type: "solid", color: phClr }, width: 12700 } : void 0);
  }
  function parseStroke(spPr, ctx, fallbackColor) {
    const ln = spPr?.["a:ln"];
    if (!ln || typeof ln !== "object") return void 0;
    if ("a:noFill" in ln) return null;
    let fill = parseFill(ln, ctx);
    if (!fill || fill.type === "none") {
      if (!fallbackColor) return void 0;
      fill = { type: "solid", color: fallbackColor };
    }
    const capMap = { flat: "flat", rnd: "round", sq: "square" };
    const dash = ln["a:prstDash"]?.["@_val"];
    const cap = ln["@_cap"] ? capMap[ln["@_cap"]] : void 0;
    const cmpdMap = {
      sng: "sng",
      dbl: "dbl",
      thickThin: "thickThin",
      thinThick: "thinThick",
      tri: "tri"
    };
    const compound = ln["@_cmpd"] ? cmpdMap[ln["@_cmpd"]] : void 0;
    const join = "a:round" in ln ? "round" : "a:bevel" in ln ? "bevel" : "a:miter" in ln ? "miter" : void 0;
    const headEnd = parseArrowEnd(ln["a:headEnd"]);
    const tailEnd = parseArrowEnd(ln["a:tailEnd"]);
    return {
      fill,
      width: intOr(ln["@_w"], 12700),
      ...dash ? { dash: String(dash) } : {},
      ...cap ? { cap } : {},
      ...join ? { join } : {},
      ...compound && compound !== "sng" ? { compound } : {},
      ...headEnd ? { headEnd } : {},
      ...tailEnd ? { tailEnd } : {}
    };
  }
  function parseArrowEnd(node) {
    if (!node || typeof node !== "object") return void 0;
    const type = String(node["@_type"] ?? "none");
    if (type === "none") return void 0;
    const wRaw = node["@_w"];
    const lenRaw = node["@_len"];
    const sizeMap = { sm: "sm", med: "med", lg: "lg" };
    return {
      type,
      ...wRaw ? { w: sizeMap[wRaw] ?? "med" } : {},
      ...lenRaw ? { len: sizeMap[lenRaw] ?? "med" } : {}
    };
  }
  function parseConnector(node, anchor, ctx) {
    const spPr = node["p:spPr"] ?? {};
    const nvCxn = node["p:nvCxnSpPr"];
    const name = nvCxn?.["p:cNvPr"]?.["@_name"];
    const prstGeom = spPr["a:prstGeom"];
    const refStroke = styleRefStroke(node, ctx);
    const fallback = (refStroke?.fill.type === "solid" ? refStroke.fill.color : void 0) ?? ctx.theme?.colors?.["dk1"] ?? "#000000";
    const explicitStroke = parseStroke(spPr, ctx, spPr?.["a:ln"] ? fallback : void 0);
    const stroke = explicitStroke === null ? void 0 : explicitStroke ?? refStroke ?? { fill: { type: "solid", color: fallback }, width: 12700 };
    const cxnPr = nvCxn?.["p:cNvCxnSpPr"];
    const st = cxnPr?.["a:stCxn"];
    const end = cxnPr?.["a:endCxn"];
    const cxnRef = (n) => n?.["@_id"] != null ? { id: parseInt(n["@_id"], 10), idx: intOr(n["@_idx"], 0) } : void 0;
    const connection = st || end ? {
      ...cxnRef(st) ? { start: cxnRef(st) } : {},
      ...cxnRef(end) ? { end: cxnRef(end) } : {}
    } : void 0;
    return {
      id: uid("cxn"),
      type: "shape",
      anchor,
      transform: parseXfrm(spPr["a:xfrm"]),
      name,
      presetGeometry: prstGeom?.["@_prst"] ?? "line",
      ...parseAvLst(prstGeom?.["a:avLst"]) ? { adjust: parseAvLst(prstGeom?.["a:avLst"]) } : {},
      ...connection ? { connection } : {},
      fill: { type: "none" },
      ...stroke ? { stroke } : {}
    };
  }
  function parseGlow(spPr, ctx) {
    const glow = spPr?.["a:effectLst"]?.["a:glow"];
    if (!glow || typeof glow !== "object") return void 0;
    const color = resolveColorNode2(glow, ctx);
    if (!color) return void 0;
    const rad2 = glow["@_rad"] != null ? parseInt(glow["@_rad"], 10) : 0;
    return { color, radius: Number.isFinite(rad2) ? rad2 : 0 };
  }
  function parseReflection(spPr) {
    const r = spPr?.["a:effectLst"]?.["a:reflection"];
    if (!r || typeof r !== "object") return void 0;
    return {
      blurRad: intOr(r["@_blurRad"], 0),
      startA: r["@_stA"] != null ? intOr(r["@_stA"], 1e5) / 1e5 : 1,
      endPos: r["@_endPos"] != null ? intOr(r["@_endPos"], 1e5) / 1e5 : 1,
      dist: intOr(r["@_dist"], 0)
    };
  }
  function parseShadow(spPr, ctx) {
    const outer = spPr?.["a:effectLst"]?.["a:outerShdw"];
    const shdw = outer ?? spPr?.["a:effectLst"]?.["a:innerShdw"];
    if (!shdw || typeof shdw !== "object") return void 0;
    const color = resolveColorNode2(shdw, ctx);
    if (!color) return void 0;
    const sx = shdw["@_sx"] != null ? intOr(shdw["@_sx"], 1e5) / 1e5 : void 0;
    const sy = shdw["@_sy"] != null ? intOr(shdw["@_sy"], 1e5) / 1e5 : void 0;
    const kx = shdw["@_kx"] != null ? intOr(shdw["@_kx"], 0) / 6e4 : void 0;
    const ky = shdw["@_ky"] != null ? intOr(shdw["@_ky"], 0) / 6e4 : void 0;
    return {
      color,
      blurRad: intOr(shdw["@_blurRad"], 0),
      dist: intOr(shdw["@_dist"], 0),
      dirDeg: intOr(shdw["@_dir"], 0) / 6e4,
      ...outer ? {} : { inner: true },
      ...sx != null ? { sx } : {},
      ...sy != null ? { sy } : {},
      ...kx ? { kxDeg: kx } : {},
      ...ky ? { kyDeg: ky } : {},
      ...typeof shdw["@_algn"] === "string" ? { algn: shdw["@_algn"] } : {}
    };
  }
  function parseScene3D(spPr, ctx) {
    const s3 = spPr?.["a:scene3d"];
    const camera = s3?.["a:camera"];
    const cameraPreset = camera?.["@_prst"];
    if (!cameraPreset) return void 0;
    const sp3d = spPr?.["a:sp3d"];
    const rot = (node) => {
      const r = node?.["a:rot"];
      if (!r || typeof r !== "object") return void 0;
      return { lat: intOr(r["@_lat"], 0), lon: intOr(r["@_lon"], 0), rev: intOr(r["@_rev"], 0) };
    };
    const rig = s3["a:lightRig"];
    const bevelT = sp3d?.["a:bevelT"];
    const extrusionClr = sp3d?.["a:extrusionClr"];
    const extrusionColor = extrusionClr && typeof extrusionClr === "object" ? resolveColorNode2(extrusionClr, ctx) : void 0;
    const cameraRot = rot(camera);
    const lightRot = rot(rig);
    return {
      cameraPreset,
      ...cameraRot ? { cameraRot } : {},
      ...rig?.["@_rig"] ? { lightRig: rig["@_rig"] } : {},
      ...rig?.["@_dir"] ? { lightDir: rig["@_dir"] } : {},
      ...lightRot ? { lightRot } : {},
      ...sp3d?.["@_extrusionH"] != null ? { extrusionEmu: intOr(sp3d["@_extrusionH"], 0) } : {},
      ...sp3d?.["@_z"] != null ? { zEmu: intOr(sp3d["@_z"], 0) } : {},
      ...extrusionColor ? { extrusionColor } : {},
      ...sp3d?.["@_prstMaterial"] ? { material: sp3d["@_prstMaterial"] } : {},
      ...bevelT !== void 0 ? {
        bevelTop: {
          wEmu: intOr(bevelT?.["@_w"], 76200),
          hEmu: intOr(bevelT?.["@_h"], 76200),
          preset: typeof bevelT?.["@_prst"] === "string" ? bevelT["@_prst"] : "circle"
        }
      } : {}
    };
  }
  function parseAvLst(avLst) {
    const gdRaw = avLst?.["a:gd"];
    if (!gdRaw) return void 0;
    const list = Array.isArray(gdRaw) ? gdRaw : [gdRaw];
    const out = {};
    for (const gd of list) {
      const name = gd?.["@_name"];
      const m = /^val\s+(-?\d+)/.exec(String(gd?.["@_fmla"] ?? ""));
      if (name && m) out[name] = parseInt(m[1], 10);
    }
    return Object.keys(out).length ? out : void 0;
  }
  var GROUP_CHILD_TAGS = ["p:sp", "p:pic", "p:grpSp", "p:graphicFrame", "p:cxnSp"];
  var MAX_GROUP_DEPTH = 64;
  var MAX_GROUP_DESCENDANTS = 1e4;
  function groupExceedsBudget(xml) {
    const tags = new Set(GROUP_CHILD_TAGS);
    GROUP_TAG_RE.lastIndex = 0;
    let groupDepth = 0;
    let descendants = 0;
    let match;
    while (match = GROUP_TAG_RE.exec(xml)) {
      const tag = match[0];
      if (tag.startsWith("<!--") || tag.startsWith("<![") || tag.startsWith("<?")) continue;
      const closing = tag.startsWith("</");
      const self2 = !closing && tag.endsWith("/>");
      const name = GROUP_NAME_RE.exec(tag)?.[1] ?? "";
      if (closing) {
        if (name === "p:grpSp") groupDepth--;
        continue;
      }
      if (name === "p:grpSp") {
        if (groupDepth > 0 && ++descendants > MAX_GROUP_DESCENDANTS) return true;
        if (!self2 && ++groupDepth > MAX_GROUP_DEPTH) return true;
        continue;
      }
      if (groupDepth > 0 && tags.has(name) && ++descendants > MAX_GROUP_DESCENDANTS) return true;
    }
    return false;
  }
  function parseGroup(node, anchor, ctx, rawXml, depth = 0, budget = { remaining: MAX_GROUP_DESCENDANTS }) {
    const grpSpPr = node["p:grpSpPr"] ?? {};
    const xfrm = grpSpPr["a:xfrm"];
    const transform = parseXfrm(xfrm);
    const name = node["p:nvGrpSpPr"]?.["p:cNvPr"]?.["@_name"];
    const groupFill = "a:grpFill" in grpSpPr ? ctx.groupFill : parseFill(grpSpPr, ctx) ?? ctx.groupFill;
    const childCtx = groupFill === ctx.groupFill ? ctx : { ...ctx, groupFill };
    const chOff = xfrm?.["a:chOff"];
    const chExt = xfrm?.["a:chExt"];
    const childOffset = chOff || chExt ? {
      x: chOff ? parseInt(chOff["@_x"], 10) || 0 : 0,
      y: chOff ? parseInt(chOff["@_y"], 10) || 0 : 0,
      cx: chExt ? parseInt(chExt["@_cx"], 10) || 0 : 0,
      cy: chExt ? parseInt(chExt["@_cy"], 10) || 0 : 0
    } : void 0;
    const group = {
      id: uid("grp"),
      type: "group",
      anchor,
      transform,
      name,
      children: [],
      ...childOffset ? { childOffset } : {}
    };
    if (depth >= MAX_GROUP_DEPTH || budget.remaining <= 0) return group;
    const groupXml = rawXml || anchor.originalXml;
    const slices = sliceGroupChildren(groupXml);
    const byTag = {};
    for (const s of slices) (byTag[s.name] ??= []).push(s);
    const ordered = [];
    for (const tag of GROUP_CHILD_TAGS) {
      const raw = node[tag];
      if (!raw) continue;
      const list = Array.isArray(raw) ? raw : [raw];
      list.forEach((child, i) => {
        if (budget.remaining <= 0) return;
        budget.remaining--;
        const slice = byTag[tag]?.[i];
        const el = parseGroupChild(tag, child, childCtx, slice?.xml, depth + 1, budget);
        if (el) ordered.push({ el, start: slice?.start ?? Number.MAX_SAFE_INTEGER });
      });
      if (budget.remaining <= 0) break;
    }
    ordered.sort((a, b) => a.start - b.start);
    group.children = ordered.map((o) => o.el);
    return group;
  }
  function parseGroupChild(tag, child, ctx, rawXml, depth = 0, budget = { remaining: MAX_GROUP_DESCENDANTS }) {
    const childAnchor = { spIndex: -1, originalXml: "", range: [0, 0] };
    if (isHiddenElement(child, tag)) return null;
    let el;
    switch (tag) {
      case "p:sp":
        el = parseSpShape(child, childAnchor, ctx, rawXml);
        break;
      case "p:pic":
        el = parsePicture(child, childAnchor, ctx, rawXml);
        break;
      case "p:grpSp":
        el = parseGroup(child, childAnchor, ctx, rawXml, depth, budget);
        break;
      case "p:graphicFrame":
        el = graphicFramePassthrough(child, childAnchor, ctx);
        break;
      case "p:cxnSp":
        el = parseConnector(child, childAnchor, ctx);
        break;
      default:
        return null;
    }
    const nvId = groupChildNvId(child);
    if (el && nvId != null) el.nvId = nvId;
    return el;
  }
  function groupChildNvId(child) {
    for (const key of ["p:nvSpPr", "p:nvPicPr", "p:nvGrpSpPr", "p:nvGraphicFramePr", "p:nvCxnSpPr"]) {
      const id = child?.[key]?.["p:cNvPr"]?.["@_id"];
      if (id != null) return String(id);
    }
    return void 0;
  }
  var GROUP_TAG_RE = /<\/?(?:[^<>"']|"[^"]*"|'[^']*')*>/g;
  var GROUP_NAME_RE = /^<\/?\s*([A-Za-z_][\w:.-]*)/;
  function sliceGroupChildren(xml) {
    const out = [];
    const tags = new Set(GROUP_CHILD_TAGS);
    GROUP_TAG_RE.lastIndex = 0;
    let depth = 0;
    let start = -1;
    let startName = "";
    let m;
    while (m = GROUP_TAG_RE.exec(xml)) {
      const tag = m[0];
      if (tag.startsWith("<!--") || tag.startsWith("<![") || tag.startsWith("<?")) continue;
      const closing = tag.startsWith("</");
      const self2 = !closing && tag.endsWith("/>");
      const name = GROUP_NAME_RE.exec(tag)?.[1] ?? "";
      if (closing) {
        depth--;
        if (depth === 1 && startName) {
          out.push({ name: startName, xml: xml.slice(start, m.index + tag.length), start });
          startName = "";
        }
      } else if (self2) {
        if (depth === 1 && tags.has(name)) out.push({ name, xml: tag, start: m.index });
      } else {
        if (depth === 1 && tags.has(name)) {
          start = m.index;
          startName = name;
        }
        depth++;
      }
    }
    return out;
  }
  function blipEmbedId(blip) {
    return blip?.["@_r:embed"] || svgBlipEmbedId(blip);
  }
  function svgBlipEmbedId(blip) {
    const exts = blip?.["a:extLst"]?.["a:ext"];
    for (const ext of Array.isArray(exts) ? exts : exts ? [exts] : []) {
      for (const [key, value] of Object.entries(ext)) {
        if (key === "svgBlip" || key.endsWith(":svgBlip")) {
          const id = value?.["@_r:embed"];
          if (id) return id;
        }
      }
    }
    return void 0;
  }
  function blipMediaRef(blip, embedId, ctx) {
    const svgId = svgBlipEmbedId(blip);
    return svgId && ctx.mediaRels?.get(svgId) || embedId && ctx.mediaRels?.get(embedId) || "";
  }
  function parsePicture(node, anchor, ctx, rawXml) {
    const spPr = node["p:spPr"] ?? {};
    let transform = parseXfrm(spPr["a:xfrm"]);
    const picPh = node["p:nvPicPr"]?.["p:nvPr"]?.["p:ph"];
    if (picPh && !spPr["a:xfrm"]) {
      const inherited = resolvePlaceholderTransform(
        ctx.layoutPlaceholders,
        ctx.masterPlaceholders,
        picPh["@_type"],
        picPh["@_idx"] != null ? String(picPh["@_idx"]) : void 0
      );
      if (inherited) transform = inherited;
    }
    const blipFill = node["p:blipFill"];
    const blip = blipFill?.["a:blip"];
    const embedId = blipEmbedId(blip);
    const mediaRef = blipMediaRef(blip, embedId, ctx);
    const name = node["p:nvPicPr"]?.["p:cNvPr"]?.["@_name"];
    const descr = node["p:nvPicPr"]?.["p:cNvPr"]?.["@_descr"];
    const srcRect = parseSrcRect(blipFill?.["a:srcRect"]);
    let picGeom = spPr["a:prstGeom"]?.["@_prst"];
    let picAdjust = parseAvLst(spPr["a:prstGeom"]?.["a:avLst"]);
    if (!picGeom && !spPr["a:custGeom"] && picPh) {
      const inheritedGeom = resolvePlaceholderPresetGeom(
        ctx.layoutPlaceholders,
        ctx.masterPlaceholders,
        picPh["@_type"],
        picPh["@_idx"] != null ? String(picPh["@_idx"]) : void 0
      );
      if (inheritedGeom) {
        picGeom = inheritedGeom.prst;
        picAdjust = parseAvLst(inheritedGeom.avLstRaw);
      }
    }
    const customGeometry = spPr["a:custGeom"] != null ? parseCustGeom(rawXml || anchor.originalXml, transform.offset.cx, transform.offset.cy) : void 0;
    const scene3d = parseScene3D(spPr, ctx);
    const softEdgeRad = spPr["a:effectLst"]?.["a:softEdge"]?.["@_rad"];
    const alphaAmt = blip?.["a:alphaModFix"]?.["@_amt"];
    const opacity = alphaAmt != null ? Math.max(0, Math.min(1, parseInt(alphaAmt, 10) / 1e5)) : void 0;
    const stroke = parseStroke(spPr, ctx);
    const shadow = parseShadow(spPr, ctx);
    const glow = parseGlow(spPr, ctx);
    const reflection = parseReflection(spPr);
    const fill = parseFill(spPr, ctx);
    const duotone = parseDuotone(blip, ctx);
    const clrChange = parseClrChange(blip, ctx);
    const lum = parseLum(blip);
    const biLevel = parseBiLevel(blip);
    const nvPr = node["p:nvPicPr"]?.["p:nvPr"];
    const avNode = nvPr?.["a:videoFile"] ?? nvPr?.["a:audioFile"];
    let media;
    if (avNode !== void 0) {
      const kind = nvPr?.["a:videoFile"] !== void 0 ? "video" : "audio";
      const link = avNode?.["@_r:link"];
      const rel = link ? ctx.avRels?.get(String(link)) : void 0;
      media = {
        kind,
        ...rel ? { target: rel.target, ...rel.external ? { external: true } : {} } : {}
      };
    }
    return {
      id: uid("pic"),
      type: "picture",
      anchor,
      transform,
      name,
      ...descr ? { descr } : {},
      mediaRef,
      ...srcRect ? { srcRect } : {},
      ...blipFill && typeof blipFill === "object" && "a:tile" in blipFill ? { tile: true } : {},
      ...picGeom && picGeom !== "rect" ? { presetGeometry: picGeom, ...picAdjust ? { adjust: picAdjust } : {} } : {},
      ...customGeometry ? { customGeometry } : {},
      ...scene3d ? { scene3d } : {},
      ...opacity != null && opacity < 1 ? { opacity } : {},
      ...softEdgeRad != null ? { softEdge: intOr(softEdgeRad, 0) } : {},
      ...media ? { media } : {},
      ...fill ? { fill } : {},
      ...duotone ? { duotone } : {},
      ...clrChange ? { clrChange } : {},
      ...lum ? { lum } : {},
      ...biLevel != null ? { biLevel } : {},
      ...stroke ? { stroke } : {},
      ...shadow ? { shadow } : {},
      ...glow ? { glow } : {},
      ...reflection ? { reflection } : {}
    };
  }
  function parseSrcRect(sr) {
    if (!sr || typeof sr !== "object") return void 0;
    const f = (k) => intOr(sr[`@_${k}`], 0) / 1e5;
    const rect = { l: f("l"), t: f("t"), r: f("r"), b: f("b") };
    if (!rect.l && !rect.t && !rect.r && !rect.b) return void 0;
    return rect;
  }
  function parseChartUserLines(usXml, ctx) {
    let doc;
    try {
      doc = parser2.parse(usXml);
    } catch {
      return [];
    }
    const anchorsRaw = doc["c:userShapes"]?.["cdr:relSizeAnchor"];
    const anchors = Array.isArray(anchorsRaw) ? anchorsRaw : anchorsRaw ? [anchorsRaw] : [];
    const out = [];
    for (const a of anchors) {
      const spRaw = a?.["cdr:sp"];
      const sp = Array.isArray(spRaw) ? spRaw[0] : spRaw;
      const spPr = sp?.["cdr:spPr"];
      const prst = spPr?.["a:prstGeom"]?.["@_prst"];
      if (prst !== "line" && prst !== "straightConnector1") continue;
      const color = resolveColorNode2(spPr?.["a:ln"]?.["a:solidFill"], ctx);
      if (!color) continue;
      const frac = (n) => {
        const v = parseFloat(String(n ?? ""));
        return Number.isFinite(v) ? v : 0;
      };
      const w = parseInt(spPr?.["a:ln"]?.["@_w"], 10);
      out.push({
        x1: frac(a?.["cdr:from"]?.["cdr:x"]),
        y1: frac(a?.["cdr:from"]?.["cdr:y"]),
        x2: frac(a?.["cdr:to"]?.["cdr:x"]),
        y2: frac(a?.["cdr:to"]?.["cdr:y"]),
        color,
        widthEmu: Number.isFinite(w) && w > 0 ? w : 9525
      });
    }
    return out;
  }
  function graphicFramePassthrough(node, anchor, ctx) {
    const data = node["a:graphic"]?.["a:graphicData"];
    const uri = data?.["@_uri"] ?? "";
    if (uri.includes("/table") && data?.["a:tbl"]) {
      const table = parseTable(node, data["a:tbl"], anchor, ctx);
      if (table) return table;
    }
    if (uri.includes("/chartex")) {
      const rid = data?.["cx:chart"]?.["@_r:id"];
      const chartXml = rid ? ctx.chartXmls?.get(String(rid)) : void 0;
      const ovXml = rid ? ctx.chartThemeOverrides?.get(String(rid)) : void 0;
      const chartTheme = ovXml ? themeWithOverride(ctx.theme, ovXml) : ctx.theme;
      const model = chartXml ? parseChartExXml(chartXml, chartTheme) : null;
      if (model) {
        const cNvPr = node["p:nvGraphicFramePr"]?.["p:cNvPr"];
        return {
          id: uid("chart"),
          type: "chart",
          anchor,
          transform: parseXfrm(node["p:xfrm"]),
          name: cNvPr?.["@_name"],
          chart: model
        };
      }
    }
    if (uri.includes("/chart")) {
      const rid = data?.["c:chart"]?.["@_r:id"];
      const chartXml = rid ? ctx.chartXmls?.get(rid) : void 0;
      const ovXml = rid ? ctx.chartThemeOverrides?.get(String(rid)) : void 0;
      const chartTheme = ovXml ? themeWithOverride(ctx.theme, ovXml) : ctx.theme;
      const chartFillCtx = {
        ...ctx,
        mediaRels: ctx.chartMediaRels?.get(String(rid)),
        theme: chartTheme
      };
      const model = chartXml ? parseChartXml(chartXml, chartTheme, (spPr) => parseFill(spPr, chartFillCtx)) : null;
      if (model && ctx.chartStyleRels?.has(String(rid))) model.hasStylePart = true;
      if (model) {
        const usXml = rid ? ctx.chartUserShapes?.get(String(rid)) : void 0;
        if (usXml) {
          const lines = parseChartUserLines(usXml, ctx);
          if (lines.length) model.userLines = lines;
        }
      }
      if (model) {
        const cNvPr = node["p:nvGraphicFramePr"]?.["p:cNvPr"];
        const descr = cNvPr?.["@_descr"] || void 0;
        return {
          id: uid("chart"),
          type: "chart",
          anchor,
          transform: parseXfrm(node["p:xfrm"]),
          name: cNvPr?.["@_name"],
          ...descr ? { descr } : {},
          chart: model
        };
      }
    }
    let kind = "unknown";
    if (uri.includes("/table")) kind = "table";
    else if (uri.includes("/chart")) kind = "chart";
    else if (uri.includes("/diagram") || uri.includes("SmartArt")) kind = "smartart";
    else if (uri.includes("/ole")) kind = "ole";
    const transform = parseXfrm(node["p:xfrm"]);
    const el = {
      id: uid("gf"),
      type: "passthrough",
      anchor,
      transform,
      kind
    };
    if (kind === "smartart") {
      const dm = data?.["dgm:relIds"]?.["@_r:dm"];
      const drawingXml = dm ? ctx.diagramDrawings?.get(String(dm)) : void 0;
      if (drawingXml) {
        const drawingRels = dm ? ctx.diagramMediaRels?.get(String(dm)) : void 0;
        const csRel = data?.["dgm:relIds"]?.["@_r:cs"];
        const txColors = diagramTextColors(
          dm ? ctx.diagramDatas?.get(String(dm)) : void 0,
          csRel ? ctx.diagramColors?.get(String(csRel)) : void 0,
          ctx
        );
        const shapes = parseDiagramDrawing(
          drawingXml,
          drawingRels ? { ...ctx, mediaRels: drawingRels } : ctx,
          txColors
        );
        const meaningful = shapes.length > 1 || shapes.some(
          (sh) => sh.text?.paragraphs?.some((par) => par.runs?.some((r) => r.text?.trim()))
        );
        if (shapes.length && meaningful) el.previewShapes = shapes;
      }
      if (!el.previewShapes?.length && transform) {
        const dataXml = dm ? ctx.diagramDatas?.get(String(dm)) : void 0;
        if (dataXml) {
          const lo = data?.["dgm:relIds"]?.["@_r:lo"];
          const cs = data?.["dgm:relIds"]?.["@_r:cs"];
          const layoutXml = lo ? ctx.diagramLayouts?.get(String(lo)) : void 0;
          const uniqueId = layoutXml ? /\buniqueId="([^"]+)"/.exec(layoutXml)?.[1]?.split("/").pop() : void 0;
          const colorsXml = cs ? ctx.diagramColors?.get(String(cs)) : void 0;
          const shapes = layoutDiagramFallback(
            dataXml,
            ctx,
            transform.offset.cx,
            transform.offset.cy,
            uniqueId,
            colorsXml,
            layoutXml
          );
          if (shapes.length) el.previewShapes = shapes;
        }
      }
    }
    if (kind === "ole") {
      const pic = findDescendantPic(data);
      const hasBlip = pic?.["p:blipFill"]?.["a:blip"]?.["@_r:embed"] != null;
      if (pic && hasBlip) el.previewPicture = parsePicture(pic, anchor, ctx);
      else if (transform) {
        const oleObj = data?.["p:oleObj"] ?? data?.["mc:AlternateContent"]?.["mc:Choice"]?.["p:oleObj"] ?? data?.["mc:AlternateContent"]?.["mc:Fallback"]?.["p:oleObj"];
        const spid = oleObj?.["@_spid"];
        const mediaRef = spid != null ? ctx.vmlPreviews?.get(String(spid)) : void 0;
        if (mediaRef) {
          el.previewPicture = { id: uid("olepic"), type: "picture", anchor, transform, mediaRef };
        }
      }
    }
    return el;
  }
  function diagramTextColors(dataXml, colorsXml, ctx) {
    const out = /* @__PURE__ */ new Map();
    if (!dataXml || !colorsXml) return out;
    const lblColor = /* @__PURE__ */ new Map();
    for (const m of colorsXml.matchAll(/<dgm:styleLbl name="([^"]+)">([\s\S]*?)<\/dgm:styleLbl>/g)) {
      const lst = /<dgm:txFillClrLst[^>]*>([\s\S]*?)<\/dgm:txFillClrLst>/.exec(m[2])?.[1];
      if (!lst) continue;
      const cm = /<a:schemeClr val="([^"]+)"|<a:srgbClr val="([^"]+)"/.exec(lst);
      if (!cm) continue;
      const c = cm[1] ? resolveColorNode2({ "a:schemeClr": { "@_val": cm[1] } }, ctx) : "#" + String(cm[2]).toUpperCase();
      if (c) lblColor.set(m[1], c);
    }
    if (!lblColor.size) return out;
    for (const m of dataXml.matchAll(/<dgm:pt modelId="([^"]+)" type="pres"[\s\S]*?<\/dgm:pt>/g)) {
      const lbl = /presStyleLbl="([^"]+)"/.exec(m[0])?.[1];
      const c = lbl ? lblColor.get(lbl) : void 0;
      if (c) out.set(m[1], c);
    }
    return out;
  }
  function parseDiagramDrawing(drawingXml, parentCtx, txColors) {
    const ctx = { ...parentCtx, defaultTextStyle: void 0 };
    const xml = drawingXml.replace(/<(\/?)dsp:/g, "<$1p:").replace(
      /<a:t(\s[^>]*)?>([^<]*\n[^<]*)<\/a:t>/g,
      (_m, attrs, t) => `<a:t${attrs ?? ""}>${t.replace(/\r?\n/g, DGM_PARA_BREAK)}</a:t>`
    );
    let doc;
    try {
      doc = parser2.parse(xml);
    } catch {
      return [];
    }
    const spTree = doc["p:drawing"]?.["p:spTree"];
    if (!spTree) return [];
    const spsRaw = spTree["p:sp"];
    const sps = Array.isArray(spsRaw) ? spsRaw : spsRaw ? [spsRaw] : [];
    const out = [];
    for (let sp of sps) {
      const anchor = { spIndex: -1, originalXml: "", range: [0, 0] };
      const txC = txColors?.get(String(sp["@_modelId"] ?? ""));
      if (txC && sp["p:txBody"]) {
        sp = {
          ...sp,
          "p:style": {
            ...sp["p:style"] ?? {},
            "a:fontRef": { "@_idx": "minor", "a:srgbClr": { "@_val": txC.replace("#", "") } }
          }
        };
      }
      const txXfrm = sp["p:txXfrm"];
      const txBody = sp["p:txBody"];
      if (txXfrm && typeof txXfrm === "object" && txBody) {
        const shapeOnly = { ...sp };
        delete shapeOnly["p:txBody"];
        const shapeEl = parseSpShape(shapeOnly, anchor, ctx);
        if (shapeEl.type !== "passthrough") out.push(shapeEl);
        const spRot = parseInt(sp["p:spPr"]?.["a:xfrm"]?.["@_rot"] ?? "0", 10) || 0;
        const txRot = parseInt(txXfrm["@_rot"] ?? "0", 10) || 0;
        const textXfrm = { ...txXfrm, "@_rot": String(spRot + txRot) };
        const fontRef = sp["p:style"]?.["a:fontRef"];
        const textSp = {
          "p:nvSpPr": sp["p:nvSpPr"],
          "p:spPr": {
            "a:xfrm": textXfrm,
            "a:prstGeom": { "@_prst": "rect" },
            "a:noFill": {},
            "a:ln": { "a:noFill": {} }
          },
          ...fontRef ? { "p:style": { "a:fontRef": fontRef } } : {},
          "p:txBody": txBody
        };
        const textEl2 = parseSpShape(textSp, anchor, ctx);
        if (textEl2.type !== "passthrough") out.push(textEl2);
        continue;
      }
      const el = parseSpShape(sp, anchor, ctx);
      if (el.type !== "passthrough") out.push(el);
    }
    for (const el of out) if ("text" in el && el.text) splitDiagramParagraphs(el.text);
    return out;
  }
  var DGM_PARA_BREAK = "\u2029";
  function splitDiagramParagraphs(body) {
    if (!body.paragraphs.some((p) => p.runs.some((r) => r.text.includes(DGM_PARA_BREAK)))) return;
    const out = [];
    for (const p of body.paragraphs) {
      let cur = { ...p, runs: [] };
      for (const r of p.runs) {
        r.text.split(DGM_PARA_BREAK).forEach((part, i) => {
          if (i > 0) {
            out.push(cur);
            cur = { ...p, runs: [] };
          }
          if (part) cur.runs.push({ ...r, text: part });
        });
      }
      out.push(cur);
    }
    body.paragraphs = out;
  }
  var MAX_DGM_TREE_DEPTH = 256;
  function dgmBulletLines(node, lvl = 1) {
    const out = [];
    for (const c of node.children) {
      for (const t of c.texts.length ? c.texts : [""]) if (t) out.push({ text: t, lvl });
      out.push(...dgmBulletLines(c, lvl + 1));
    }
    return out;
  }
  function diagramLabelFills(colorsXml, ctx) {
    const out = /* @__PURE__ */ new Map();
    if (!colorsXml) return out;
    let doc;
    try {
      doc = parser2.parse(colorsXml);
    } catch {
      return out;
    }
    const raw = doc?.["dgm:colorsDef"]?.["dgm:styleLbl"];
    const lbls = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const lbl of lbls) {
      const lst = lbl?.["dgm:fillClrLst"];
      if (!lst || typeof lst !== "object") continue;
      const fills = [];
      for (const tag of COLOR_NODE_TAGS) {
        const v = lst[tag];
        for (const c of Array.isArray(v) ? v : v ? [v] : []) {
          const hex = resolveColorNode2({ [tag]: c }, ctx);
          if (hex) fills.push(hex.slice(0, 7));
        }
      }
      if (fills.length) out.set(String(lbl["@_name"]), fills);
    }
    return out;
  }
  function dgmSp(box, fill, lines, opts = {}) {
    const fillNode = opts.noFill ? { "a:noFill": {} } : typeof fill === "string" ? { "a:solidFill": { "a:srgbClr": { "@_val": fill.replace("#", "") } } } : { "a:solidFill": fill.spPr?.["a:solidFill"] };
    return {
      "p:spPr": {
        "a:xfrm": {
          ...opts.rot ? { "@_rot": String(opts.rot) } : {},
          "a:off": { "@_x": String(Math.round(box.x)), "@_y": String(Math.round(box.y)) },
          "a:ext": { "@_cx": String(Math.round(box.cx)), "@_cy": String(Math.round(box.cy)) }
        },
        "a:prstGeom": {
          "@_prst": opts.prst ?? "rect",
          ...opts.adjs?.length ? {
            "a:avLst": {
              "a:gd": opts.adjs.map((a) => ({
                "@_name": a.name,
                "@_fmla": "val " + Math.round(a.val)
              }))
            }
          } : opts.adj != null ? {
            "a:avLst": { "a:gd": { "@_name": "adj", "@_fmla": "val " + Math.round(opts.adj) } }
          } : {}
        },
        ...fillNode,
        ...opts.stroke ? {
          "a:ln": {
            "@_w": "9525",
            "a:solidFill": { "a:srgbClr": { "@_val": opts.stroke.replace("#", "") } }
          }
        } : {}
      },
      ...lines.length ? {
        "p:txBody": {
          "a:bodyPr": { "@_anchor": opts.anchor ?? "ctr" },
          "a:p": lines.map((l) => ({
            "a:pPr": {
              "@_algn": opts.align ?? "ctr",
              ...l.lvl > 0 ? {
                "@_marL": String(228600 * l.lvl),
                "@_indent": "-114300",
                "a:buChar": { "@_char": "\u2022" }
              } : { "a:buNone": {} }
            },
            "a:r": {
              "a:rPr": {
                "@_sz": String(Math.round(l.sizePt * 100)),
                ...l.bold ? { "@_b": "1" } : {},
                "a:solidFill": {
                  "a:srgbClr": { "@_val": (opts.textColor ?? "#FFFFFF").replace("#", "") }
                }
              },
              "a:t": l.text
            }
          }))
        }
      } : {}
    };
  }
  function dgmTint(hex, pct) {
    const h = hex.replace("#", "");
    const mix = (i) => Math.round(255 * (1 - pct) + parseInt(h.slice(i, i + 2), 16) * pct).toString(16).toUpperCase().padStart(2, "0");
    return "#" + mix(0) + mix(2) + mix(4);
  }
  function layoutDiagramFallback(dataXml, ctx, frameCx, frameCy, layoutId, colorsXml, layoutXml) {
    let doc;
    try {
      doc = parser2.parse(dataXml);
    } catch {
      return [];
    }
    const model = doc["dgm:dataModel"];
    const ptsRaw = model?.["dgm:ptLst"]?.["dgm:pt"];
    const pts = Array.isArray(ptsRaw) ? ptsRaw : ptsRaw ? [ptsRaw] : [];
    const cxnsRaw = model?.["dgm:cxnLst"]?.["dgm:cxn"];
    const cxns = Array.isArray(cxnsRaw) ? cxnsRaw : cxnsRaw ? [cxnsRaw] : [];
    const docId = pts.find((p) => p?.["@_type"] === "doc")?.["@_modelId"];
    if (docId == null) return [];
    const nodePts = new Map(
      pts.filter((p) => p?.["@_type"] == null || p?.["@_type"] === "node" || p?.["@_type"] === "asst").map((p) => [String(p["@_modelId"]), p])
    );
    const presPts = new Map(
      pts.filter((p) => p?.["@_type"] === "pres").map((p) => [String(p["@_modelId"]), p])
    );
    const hierBranchOf = /* @__PURE__ */ new Map();
    const styleOf = /* @__PURE__ */ new Map();
    for (const pres of presPts.values()) {
      const prSet = pres?.["dgm:prSet"];
      const hb = prSet?.["dgm:presLayoutVars"]?.["dgm:hierBranch"]?.["@_val"];
      const assoc = prSet?.["@_presAssocID"];
      if (hb && hb !== "init" && assoc && !hierBranchOf.has(String(assoc)))
        hierBranchOf.set(String(assoc), String(hb));
      const lbl = prSet?.["@_presStyleLbl"];
      if (assoc && lbl && /^node\d/.test(String(lbl)) && !styleOf.has(String(assoc)))
        styleOf.set(String(assoc), {
          lbl: String(lbl),
          idx: parseInt(prSet["@_presStyleIdx"], 10) || 0
        });
    }
    const bySrc = /* @__PURE__ */ new Map();
    for (const c of cxns) {
      const t = c?.["@_type"];
      if (t != null && t !== "parOf") continue;
      if (!nodePts.has(String(c["@_destId"]))) continue;
      const k = String(c["@_srcId"]);
      if (!bySrc.has(k)) bySrc.set(k, []);
      bySrc.get(k).push(c);
    }
    for (const arr of bySrc.values())
      arr.sort((a, b) => (parseInt(a["@_srcOrd"], 10) || 0) - (parseInt(b["@_srcOrd"], 10) || 0));
    const seen = /* @__PURE__ */ new Set();
    const build = (id, depth = 0) => (bySrc.get(id) ?? []).map((c) => String(c["@_destId"])).filter((d) => !seen.has(d) && (seen.add(d), true)).map((d) => {
      const pt = nodePts.get(d);
      const sizePt = collectDgmRunSize(pt);
      const style = styleOf.get(d);
      return {
        id: d,
        texts: collectDgmTexts(pt),
        ...sizePt ? { sizePt } : {},
        ...style ? { styleLbl: style.lbl, styleIdx: style.idx } : {},
        ...pt?.["dgm:spPr"]?.["a:solidFill"] ? { spPr: pt["dgm:spPr"] } : {},
        ...pt?.["@_type"] === "asst" ? { asst: true } : {},
        ...hierBranchOf.has(d) ? { hierBranch: hierBranchOf.get(d) } : {},
        children: depth < MAX_DGM_TREE_DEPTH ? build(d, depth + 1) : []
      };
    });
    const roots = build(String(docId));
    if (!roots.length) return [];
    const labelFills = diagramLabelFills(colorsXml, ctx);
    const colors = labelFills.get("node1") ?? labelFills.get("node0") ?? [
      resolveColorNode2({ "a:schemeClr": { "@_val": "accent1" } }, ctx) ?? "#4472C4"
    ];
    const colorOf = (node, i) => {
      if (node.spPr) return { spPr: node.spPr };
      const slot = node.styleLbl ? labelFills.get(node.styleLbl) : void 0;
      return slot ? slot[(node.styleIdx ?? 0) % slot.length] : colors[i % colors.length];
    };
    const hasHierarchy = roots.some((r) => r.children.length);
    const sps = [];
    const fitSize = (boxCyEmu, nLines, cap = 26) => {
      const boxPt = boxCyEmu / 12700;
      return Math.max(8, Math.min(cap, boxPt * 0.82 / Math.max(nLines, 1) / 1.35));
    };
    const fitSizeW = (boxCyEmu, boxCxEmu, texts, cap = 26) => {
      let s = fitSize(boxCyEmu, Math.max(texts.length, 1), cap);
      const boxWPt = boxCxEmu / 12700 * 0.92;
      const boxHPt = boxCyEmu / 12700 * 0.9;
      const longest = Math.max(0, ...texts.flatMap((t) => t.split(/\s+/).map((w) => w.length)));
      if (longest) s = Math.min(s, boxWPt / (longest * 0.62));
      for (let i = 0; i < 3; i++) {
        const lines = texts.reduce(
          (acc, t) => acc + Math.max(1, Math.ceil(t.length * 0.62 * s / boxWPt)),
          0
        );
        const need = lines * 1.35 * s;
        if (need <= boxHPt) break;
        s *= Math.sqrt(boxHPt / need);
      }
      return Math.max(6, s);
    };
    const byLayout = layoutId === "cycle4" ? "cycleMatrix" : layoutId != null && /^arrow5/.test(layoutId) ? "arrowRing" : layoutId != null && /^hProcess3(#|$)/.test(layoutId) ? "ruleArrow" : layoutId === "hList1" || layoutId === "hList2" ? "columns" : layoutId === "hList3" ? "tableList" : layoutId != null && /^pList/.test(layoutId) ? "pictureList" : layoutId != null && /^list/.test(layoutId) ? "boxList" : layoutId === "vList5" || layoutId != null && /^Bracket/.test(layoutId) ? "sideList" : layoutId === "vProcess5" ? "stepped" : layoutId != null && /^(vList|vProcess)/.test(layoutId) ? "stacked" : layoutId != null && /^bList/.test(layoutId) ? "cards" : layoutId != null && /^process4(#|$)/.test(layoutId) ? "arrowBands" : layoutId != null && /^(process|hProcess|bProcess)/.test(layoutId) ? "procCards" : layoutId != null && /^lProcess/.test(layoutId) ? "colProcess" : layoutId != null && /^equation/.test(layoutId) ? "equation" : layoutId != null && /^pyramid/.test(layoutId) ? "pyramid" : layoutId != null && /^Picture/.test(layoutId) ? "strips" : layoutId === "chevron2" ? "chevronList" : layoutId != null && /^chevron/.test(layoutId) ? "chevronRow" : layoutId != null && /^(cycle[127]|radial)/.test(layoutId) ? "cycle" : layoutId != null && /orgchart/i.test(layoutId) ? "orgChart" : layoutId != null && /^hierarchy/.test(layoutId) ? "hierarchy" : "blocks";
    const family = byLayout === "blocks" && !hasHierarchy ? "flatGrid" : byLayout;
    if (family === "flatGrid") {
      const n = roots.length;
      const GAP = 0.115;
      const ASPECT = 0.6;
      const availCy = frameCy * 0.98;
      let cols = 1;
      let best = 0;
      for (let c = 1; c <= n; c++) {
        const r = Math.ceil(n / c);
        const w = Math.min(frameCx / (c + (c - 1) * GAP), availCy / (r * ASPECT + (r - 1) * GAP));
        if (w > best) {
          best = w;
          cols = c;
        }
      }
      const rows = Math.ceil(n / cols);
      const bw = best;
      const bh = bw * ASPECT;
      const gap = bw * GAP;
      const gridW = cols * bw + (cols - 1) * gap;
      const gridH = rows * bh + (rows - 1) * gap;
      const xOff = (frameCx - gridW) / 2;
      const yOff = (frameCy - gridH) / 2;
      roots.forEach((node, i) => {
        const row = Math.floor(i / cols);
        const inRow = row === rows - 1 ? n - (rows - 1) * cols : cols;
        const col = i - row * cols;
        const rowW = inRow * bw + (inRow - 1) * gap;
        const x = xOff + (gridW - rowW) / 2 + col * (bw + gap);
        const y = yOff + row * (bh + gap);
        const t = fitSizeW(bh * 0.5, bw, node.texts);
        sps.push(
          dgmSp(
            { x, y, cx: bw, cy: bh },
            colorOf(node, i),
            node.texts.map((tx) => ({ text: tx, lvl: 0, sizePt: t }))
          )
        );
      });
    } else if (family === "equation") {
      const n = roots.length;
      const OP = 0.42;
      const d = Math.min(frameCy * 0.92, frameCx / (n + (n - 1) * OP));
      const opW = d * OP;
      const totalW = n * d + (n - 1) * opW;
      const x0 = (frameCx - totalW) / 2;
      const yC = (frameCy - d) / 2;
      const opColor = typeof colors[0] === "string" ? colors[0] : "#4472C4";
      roots.forEach((node, i) => {
        const x = x0 + i * (d + opW);
        sps.push(
          dgmSp(
            { x, y: yC, cx: d, cy: d },
            colorOf(node, i),
            node.texts.map((tx) => ({
              text: tx,
              lvl: 0,
              sizePt: fitSizeW(d * 0.72, d * 0.78, node.texts)
            })),
            { prst: "ellipse" }
          )
        );
        if (i < n - 1) {
          const g = d * 0.3;
          sps.push(
            dgmSp(
              { x: x + d + (opW - g) / 2, y: yC + (d - g) / 2, cx: g, cy: g },
              dgmTint(opColor, 0.25),
              [],
              { prst: i === n - 2 ? "mathEqual" : "mathPlus" }
            )
          );
        }
      });
    } else if (family === "colProcess") {
      const n = roots.length;
      const gap = frameCx * 0.045;
      const cw = (frameCx - gap * (n - 1)) / n;
      const kMax = Math.max(...roots.map((r) => r.children.length), 1);
      const usedCy = frameCy * 0.78;
      const yTop = (frameCy - usedCy) * 0.55;
      const bh = usedCy / (1 + 1.48 * kMax);
      const vGap = bh * 0.48;
      roots.forEach((node, i) => {
        const x = i * (cw + gap);
        const base = colorOf(node, i);
        const baseHex = typeof base === "string" ? base : void 0;
        if (!roots.some((r) => r.children.length)) {
          const pw = Math.min(cw, frameCy * 1.5);
          const pt = fitSizeW(frameCy * 0.25, pw, node.texts, 22);
          sps.push(
            dgmSp(
              { x: x + (cw - pw) / 2, y: frameCy * 0.06, cx: pw, cy: frameCy * 0.88 },
              baseHex ? dgmTint(baseHex, 0.22) : base,
              node.texts.map((tx) => ({ text: tx, lvl: 0, sizePt: pt })),
              { textColor: "#000000", anchor: "t", prst: "roundRect", adj: 1e4 }
            )
          );
          return;
        }
        const t = fitSizeW(bh * 0.9, cw, node.texts, 26);
        sps.push(
          dgmSp(
            { x, y: yTop, cx: cw, cy: bh },
            base,
            node.texts.map((tx) => ({ text: tx, lvl: 0, sizePt: t }))
          )
        );
        node.children.forEach((kid, k) => {
          const y = yTop + bh + k * (vGap + bh);
          const dotD = bh * 0.14;
          sps.push(
            dgmSp(
              { x: x + cw / 2 - dotD / 2, y: y + vGap / 2 - dotD / 2, cx: dotD, cy: dotD },
              base,
              [],
              { prst: "ellipse" }
            )
          );
          const kt = fitSizeW(bh * 0.7, cw, kid.texts, 17);
          sps.push(
            dgmSp(
              { x, y: y + vGap, cx: cw, cy: bh },
              baseHex ? dgmTint(baseHex, 0.25) : base,
              kid.texts.map((tx) => ({ text: tx, lvl: 0, sizePt: kt })),
              { textColor: "#404040", prst: "roundRect", adj: 8e3 }
            )
          );
        });
      });
    } else if (family === "columns") {
      const n = roots.length;
      const gap = frameCy * 0.055;
      const availCy = frameCy * 0.92;
      const y0 = frameCy * 0.04;
      const cw = Math.min((frameCx - gap * (n - 1)) / n, availCy * 0.52);
      const x0 = (frameCx - (cw * n + gap * (n - 1))) / 2;
      const headCy = availCy * 0.18;
      roots.forEach((node, i) => {
        const x = x0 + i * (cw + gap);
        const base = colorOf(node, i);
        const baseHex = typeof base === "string" ? base : void 0;
        const t = fitSize(headCy, Math.max(node.texts.length, 1), 20);
        sps.push(
          dgmSp(
            { x, y: y0, cx: cw, cy: headCy },
            base,
            node.texts.map((tx) => ({ text: tx, lvl: 0, sizePt: t }))
          )
        );
        const bullets = dgmBulletLines(node);
        const bodyCy = availCy - headCy - frameCy * 0.01;
        const b = fitSize(bodyCy, Math.max(bullets.length, 1), 16);
        sps.push(
          dgmSp(
            { x, y: y0 + headCy + frameCy * 0.01, cx: cw, cy: bodyCy },
            baseHex ? dgmTint(baseHex, 0.2) : base,
            bullets.map((l) => ({ text: l.text, lvl: l.lvl, sizePt: b })),
            { textColor: "#333333", align: "l", anchor: "t" }
          )
        );
      });
    } else if (family === "tableList") {
      const parent = roots[0];
      const headCy = frameCy * 0.28;
      sps.push(
        dgmSp(
          { x: 0, y: 0, cx: frameCx, cy: headCy },
          colorOf(parent, 0),
          parent.texts.map((t) => ({
            text: t,
            lvl: 0,
            sizePt: fitSize(headCy, Math.max(parent.texts.length, 1))
          }))
        )
      );
      const kids = parent.children.length ? parent.children : roots.slice(1);
      const n = Math.max(kids.length, 1);
      const gap = frameCx * 0.012;
      const cw = (frameCx - gap * (n - 1)) / n;
      kids.forEach((k, i) => {
        sps.push(
          dgmSp(
            { x: i * (cw + gap), y: headCy + frameCy * 0.012, cx: cw, cy: frameCy * 0.62 },
            colorOf(k, i + 1),
            k.texts.map((t) => ({
              text: t,
              lvl: 0,
              sizePt: fitSize(frameCy * 0.62, Math.max(k.texts.length, 1))
            }))
          )
        );
      });
      sps.push(
        dgmSp({ x: 0, y: frameCy * 0.945, cx: frameCx, cy: frameCy * 0.055 }, colorOf(parent, 0), [])
      );
    } else if (family === "stacked") {
      const n = roots.length;
      const gap = frameCy * 0.06;
      const bh = (frameCy - gap * (n - 1)) / n;
      roots.forEach((node, i) => {
        const bullets = dgmBulletLines(node);
        const nLines = node.texts.length + bullets.length;
        const t = fitSize(bh, Math.max(nLines, 1));
        const lines = [
          ...node.texts.map((tx) => ({ text: tx, lvl: 0, sizePt: t, bold: true })),
          ...bullets.map((l) => ({ text: l.text, lvl: l.lvl, sizePt: t * 0.8 }))
        ];
        sps.push(
          dgmSp({ x: 0, y: i * (bh + gap), cx: frameCx, cy: bh }, colorOf(node, i), lines, {
            prst: "roundRect",
            align: "l",
            anchor: "ctr"
          })
        );
      });
    } else if (family === "hierarchy") {
      const n = roots.length;
      const gap = frameCx * 0.03;
      const colW = (frameCx - gap * (n - 1)) / n;
      const parentCy = frameCy * 0.42;
      const childCy = frameCy * 0.48;
      roots.forEach((node, i) => {
        const x = i * (colW + gap);
        sps.push(
          dgmSp(
            { x: x + colW * 0.06, y: 0, cx: colW * 0.88, cy: parentCy },
            colorOf(node, i),
            node.texts.map((t) => ({
              text: t,
              lvl: 0,
              sizePt: fitSize(parentCy, Math.max(node.texts.length, 1))
            })),
            { prst: "roundRect" }
          )
        );
        const kids = node.children;
        if (!kids.length) return;
        const kgap = colW * 0.04;
        const kw = (colW - kgap * (kids.length - 1)) / kids.length;
        kids.forEach((k, j) => {
          sps.push(
            dgmSp(
              { x: x + j * (kw + kgap), y: frameCy - childCy, cx: kw, cy: childCy },
              colorOf(k, i),
              k.texts.map((t) => ({
                text: t,
                lvl: 0,
                sizePt: fitSize(childCy, Math.max(k.texts.length, 1), 20)
              })),
              { prst: "roundRect" }
            )
          );
        });
      });
    } else if (family === "sideList") {
      const n = roots.length;
      const gap = frameCy * 0.045;
      const ih = Math.min((frameCy * 0.98 - gap * (n - 1)) / n, frameCy * 0.2);
      roots.forEach((node, i) => {
        const y = frameCy * 0.02 + i * (ih + gap);
        const base = colorOf(node, i);
        const baseHex = typeof base === "string" ? base : void 0;
        const bullets = dgmBulletLines(node);
        if (bullets.length) {
          sps.push(
            dgmSp(
              { x: frameCx * 0.2, y, cx: frameCx * 0.38, cy: ih },
              baseHex ? dgmTint(baseHex, 0.16) : base,
              bullets.map((l) => ({
                text: l.text,
                lvl: l.lvl,
                sizePt: fitSize(ih, Math.max(bullets.length, 1), 15)
              })),
              { textColor: "#333333", align: "l" }
            )
          );
        }
        sps.push(
          dgmSp(
            { x: 0, y, cx: frameCx * 0.205, cy: ih },
            base,
            node.texts.map((tx) => ({
              text: tx,
              lvl: 0,
              sizePt: fitSize(ih, Math.max(node.texts.length, 1), 20)
            })),
            { prst: "roundRect" }
          )
        );
      });
    } else if (family === "stepped") {
      const n = roots.length;
      const gapY = frameCy * 0.055;
      const bh = (frameCy - gapY * (n - 1)) / n;
      const bw = frameCx * 0.62;
      const stepX = n > 1 ? (frameCx - bw) / (n - 1) : 0;
      roots.forEach((node, i) => {
        const x = i * stepX;
        const y = i * (bh + gapY);
        const texts = [...node.texts, ...dgmBulletLines(node).map((l) => l.text)];
        const t = fitSizeW(bh, bw, texts, 16);
        sps.push(
          dgmSp(
            { x, y, cx: bw, cy: bh },
            colorOf(node, i),
            texts.map((tx) => ({ text: tx, lvl: 0, sizePt: t })),
            { align: "l" }
          )
        );
        if (i < n - 1) {
          const ah = gapY * 0.95;
          const aw = ah * 1.1;
          const base = colorOf(node, i);
          sps.push(
            dgmSp(
              { x: x + bw * 0.78 - aw / 2, y: y + bh + gapY * 0.025, cx: aw, cy: ah },
              typeof base === "string" ? dgmTint(base, 0.45) : "#BFBFBF",
              [],
              { prst: "downArrow" }
            )
          );
        }
      });
    } else if (family === "chevronList") {
      const n = roots.length;
      const gap = frameCy * 0.045;
      const ih = (frameCy - gap * (n - 1)) / n;
      const chW = Math.min(frameCx * 0.16, ih * 0.75);
      roots.forEach((node, i) => {
        const y = i * (ih + gap);
        const base = colorOf(node, i);
        const baseHex = typeof base === "string" ? base : void 0;
        sps.push(
          dgmSp({ x: chW / 2 - ih / 2, y: y + ih / 2 - chW / 2, cx: ih, cy: chW }, base, [], {
            prst: "chevron",
            rot: 54e5
          })
        );
        const t = fitSizeW(ih * 0.9, chW * 0.85, node.texts, 13);
        sps.push(
          dgmSp(
            { x: 0, y, cx: chW, cy: ih },
            "#FFFFFF",
            node.texts.map((tx) => ({ text: tx, lvl: 0, sizePt: t })),
            { noFill: true }
          )
        );
        const bullets = dgmBulletLines(node);
        const b = fitSizeW(
          ih * 0.92,
          (frameCx - chW * 1.2) * 0.94,
          bullets.map((l) => l.text),
          13
        );
        sps.push(
          dgmSp(
            { x: chW * 1.2, y, cx: frameCx - chW * 1.2, cy: ih },
            "#FFFFFF",
            bullets.map((l) => ({ text: l.text, lvl: l.lvl, sizePt: b })),
            {
              prst: "roundRect",
              textColor: "#333333",
              align: "l",
              stroke: baseHex ?? "#999999",
              adj: 1e4
            }
          )
        );
      });
    } else if (family === "chevronRow") {
      const flat = roots.flatMap((r) => [r, ...r.children]);
      const n = flat.length;
      const overlap = 0.18;
      const ch = Math.min(frameCy * 0.34, frameCx / (n - (n - 1) * overlap) * 0.42);
      const cw = ch / 0.42;
      const step = cw * (1 - overlap);
      const rowW = cw + step * (n - 1);
      const x0 = (frameCx - rowW) / 2;
      const y = (frameCy - ch) / 2;
      flat.forEach((node, i) => {
        sps.push(
          dgmSp(
            { x: x0 + i * step, y, cx: cw, cy: ch },
            colorOf(node, i),
            node.texts.map((tx) => ({
              text: tx,
              lvl: 0,
              sizePt: fitSize(ch, Math.max(node.texts.length, 1), 20)
            })),
            { prst: "chevron" }
          )
        );
      });
    } else if (family === "arrowRing") {
      const n = Math.max(roots.length, 1);
      const R = Math.min(frameCx, frameCy) / 2;
      const bh = R * Math.min(0.98, 4.66 / n);
      const aspect = Math.min(1.8, Math.max(0.8, 0.885 + (n - 3) * 0.055));
      const bw = bh * aspect;
      const rc = R - bh / 2;
      const cxr = frameCx / 2;
      const cyr = frameCy / 2;
      const sizePt = Math.max(5, Math.min(20, 2 + bh / 12700 * 0.08));
      roots.forEach((node, i) => {
        const ang = -Math.PI / 2 + i * 2 * Math.PI / n;
        const x = cxr + Math.cos(ang) * rc;
        const y = cyr + Math.sin(ang) * rc;
        sps.push(
          dgmSp(
            { x: x - bw / 2, y: y - bh / 2, cx: bw, cy: bh },
            colorOf(node, i),
            node.texts.map((tx) => ({ text: tx, lvl: 0, sizePt })),
            {
              prst: "downArrow",
              // Head shorter than the preset default (measured 29-36% of ss vs 50%)
              adjs: [
                { name: "adj1", val: 5e4 },
                { name: "adj2", val: 32e3 }
              ],
              rot: Math.round((ang * 180 / Math.PI + 90) * 6e4)
            }
          )
        );
      });
    } else if (family === "cycleMatrix") {
      const nodes = roots.slice(0, 4);
      const cxr = frameCx / 2;
      const cyr = frameCy / 2;
      const R = frameCy * 0.44;
      const gap = frameCy * 0.015;
      const bw = frameCx * 0.333;
      const bh = frameCy * 0.316;
      const bx = frameCx * 0.064;
      const quads = [
        { a1: 108e5, dx: -1, dy: -1, bxy: { x: bx, y: 0 } },
        { a1: 162e5, dx: 1, dy: -1, bxy: { x: frameCx - bx - bw, y: 0 } },
        { a1: 0, dx: 1, dy: 1, bxy: { x: frameCx - bx - bw, y: frameCy - bh } },
        { a1: 54e5, dx: -1, dy: 1, bxy: { x: bx, y: frameCy - bh } }
      ];
      const labelPt = Math.max(10, Math.min(24, R / 12700 * 0.115));
      nodes.forEach((node, i) => {
        const q = quads[i];
        const bullets = dgmBulletLines(node);
        const strokeColor = node.spPr ? resolveColorNode2(node.spPr["a:solidFill"], ctx) ?? colors[0] : colors[0];
        sps.push(
          dgmSp(
            { x: q.bxy.x, y: q.bxy.y, cx: bw, cy: bh },
            "#FFFFFF",
            bullets.map((b) => ({
              text: b.text,
              lvl: b.lvl,
              sizePt: Math.max(8, Math.min(12, labelPt * 0.45))
            })),
            {
              prst: "roundRect",
              adj: 9e3,
              stroke: strokeColor,
              align: "l",
              anchor: "t",
              textColor: "#000000"
            }
          )
        );
      });
      nodes.forEach((node, i) => {
        const q = quads[i];
        const fill = node.spPr ? { spPr: node.spPr } : colors[0];
        const wcx = cxr + q.dx * gap;
        const wcy = cyr + q.dy * gap;
        sps.push(
          dgmSp({ x: wcx - R, y: wcy - R, cx: 2 * R, cy: 2 * R }, fill, [], {
            prst: "pie",
            adjs: [
              { name: "adj1", val: q.a1 },
              { name: "adj2", val: q.a1 + 54e5 }
            ]
          })
        );
        const lw = R * 0.9;
        const lh = labelPt * 12700 * 1.6;
        sps.push(
          dgmSp(
            {
              x: wcx + q.dx * R * 0.5 - lw / 2,
              y: wcy + q.dy * R * 0.5 - lh / 2,
              cx: lw,
              cy: lh
            },
            "#FFFFFF",
            node.texts.filter(Boolean).map((t) => ({ text: t, lvl: 0, sizePt: labelPt })),
            { noFill: true }
          )
        );
      });
      const r0 = frameCy * 0.07;
      sps.push(
        dgmSp({ x: cxr - r0, y: cyr - r0, cx: 2 * r0, cy: 2 * r0 }, "#FFFFFF", [], {
          prst: "donut",
          adj: 28e3
        })
      );
    } else if (family === "cycle") {
      const central = layoutId != null && /^radial/.test(layoutId);
      const ring = central ? roots[0].children.length ? roots[0].children : roots.slice(1) : roots;
      const n = Math.max(ring.length, 1);
      const cxr = frameCx / 2;
      const cyr = frameCy / 2;
      if (central) {
        const minDim = Math.min(frameCx, frameCy);
        const R = minDim * 0.28;
        const r = minDim * 0.17;
        const base = colors[0] ?? "#4472C4";
        const light = dgmTint(base, 0.45);
        const circle = (node, cx0, cy0, rad2, cap) => dgmSp(
          { x: cx0 - rad2, y: cy0 - rad2, cx: rad2 * 2, cy: rad2 * 2 },
          light,
          node.texts.map((tx) => ({
            text: tx,
            lvl: 0,
            sizePt: fitSize(rad2 * 2, Math.max(node.texts.length, 1) * 1.6, cap)
          })),
          { prst: "ellipse", textColor: "#333333" }
        );
        ring.forEach((node, i) => {
          const ang = -Math.PI / 2 + i * 2 * Math.PI / n;
          sps.push(
            circle(
              node,
              cxr + Math.cos(ang) * (R + r * 0.82),
              cyr + Math.sin(ang) * (R + r * 0.82),
              r,
              20
            )
          );
        });
        sps.push(circle(roots[0], cxr, cyr, R, 26));
      } else {
        const bw = Math.min(frameCx / 3.6, frameCy / 2.6);
        const bh = bw * 0.6;
        const rx = frameCx / 2 - bw / 2;
        const ry = frameCy / 2 - bh / 2;
        ring.forEach((node, i) => {
          const ang = -Math.PI / 2 + i * 2 * Math.PI / n;
          const x = cxr + Math.cos(ang) * rx;
          const y = cyr + Math.sin(ang) * ry;
          sps.push(
            dgmSp(
              { x: x - bw / 2, y: y - bh / 2, cx: bw, cy: bh },
              colorOf(node, i),
              node.texts.map((tx) => ({
                text: tx,
                lvl: 0,
                sizePt: fitSize(bh, Math.max(node.texts.length, 1), 18)
              })),
              { prst: "roundRect" }
            )
          );
        });
      }
    } else if (family === "orgChart") {
      const cons = parseHierConstraints(layoutXml);
      const geo = layoutHierTree(roots, cons, frameCx, frameCy);
      if (geo) {
        const lineW = Math.max(frameCx * 12e-4, 9525);
        const lineColor = typeof colors[0] === "string" ? colors[0] : "#4472C4";
        const withText = geo.boxes.filter((b) => b.node.texts.length);
        const sizePt = withText.length ? Math.min(...withText.map((b) => fitSizeW(b.h, b.w, b.node.texts, cons.fontMax))) : cons.fontMax;
        for (const ln of geo.lines)
          sps.push(
            dgmSp(
              { x: ln.x - lineW / 2, y: ln.y - lineW / 2, cx: ln.cx + lineW, cy: ln.cy + lineW },
              lineColor,
              []
            )
          );
        for (const b of geo.boxes)
          sps.push(
            dgmSp(
              { x: b.x, y: b.y, cx: b.w, cy: b.h },
              colorOf(b.node, 0),
              b.node.texts.map((tx) => ({ text: tx, lvl: 0, sizePt }))
            )
          );
      }
    } else if (family === "cards") {
      const n = roots.length;
      const GAP = 0.14;
      const ASPECT = 1.05;
      const availCy = frameCy * 0.96;
      let cols = 1;
      let best = 0;
      for (let c = 1; c <= n; c++) {
        const r = Math.ceil(n / c);
        const w = Math.min(frameCx / (c + (c - 1) * GAP), availCy / (r * ASPECT + (r - 1) * GAP));
        if (w > best) {
          best = w;
          cols = c;
        }
      }
      const rows = Math.ceil(n / cols);
      const bw = best;
      const bh = bw * ASPECT;
      const gap = bw * GAP;
      const gridW = cols * bw + (cols - 1) * gap;
      const gridH = rows * bh + (rows - 1) * gap;
      const y00 = (frameCy - gridH) / 2;
      roots.forEach((node, i) => {
        const row = Math.floor(i / cols);
        const col = i - row * cols;
        const x = (frameCx - gridW) / 2 + col * (bw + gap);
        const y = y00 + row * (bh + gap);
        const base = colorOf(node, i);
        const baseHex = typeof base === "string" ? base : "#4472C4";
        const bullets = dgmBulletLines(node);
        const footCy = bh * 0.28;
        sps.push(
          dgmSp(
            { x, y, cx: bw, cy: bh - footCy },
            base,
            bullets.map((l) => ({
              text: l.text,
              lvl: l.lvl,
              sizePt: fitSize(bh - footCy, Math.max(bullets.length, 1) * 2, 14)
            })),
            { textColor: "#333333", align: "l", anchor: "t", noFill: true, stroke: baseHex }
          )
        );
        sps.push(
          dgmSp(
            { x, y: y + bh - footCy, cx: bw, cy: footCy },
            base,
            node.texts.map((tx) => ({
              text: tx,
              lvl: 0,
              sizePt: fitSize(footCy, Math.max(node.texts.length, 1), 12)
            })),
            { align: "l" }
          )
        );
        const r = footCy * 0.55;
        sps.push(
          dgmSp(
            { x: x + bw - r * 1.6, y: y + bh - footCy - r * 0.45, cx: r * 2, cy: r * 2 },
            baseHex ? dgmTint(baseHex, 0.35) : base,
            [],
            { prst: "ellipse" }
          )
        );
      });
    } else if (family === "arrowBands") {
      const n = roots.length;
      const OVER = 0.015;
      const unit = frameCy / (1 + 1.538 * (n - 1) - OVER * (n - 1));
      const stroke = "#FFFFFF";
      const node1 = labelFills.get("node1") ?? colors;
      const cellFill = labelFills.get("fgAccFollowNode1")?.[0] ?? dgmTint(colors[0], 0.35);
      const heads = [];
      const cells = [];
      let y = 0;
      roots.forEach((node, i) => {
        const last = i === n - 1;
        const bh = last ? unit : unit * 1.538;
        const kids = node.children;
        const base = node.spPr ? { spPr: node.spPr } : node1[last ? 0 : 1 % node1.length];
        sps.push(
          dgmSp({ x: 0, y, cx: frameCx, cy: bh }, base, [], {
            prst: last ? "rect" : "downArrowCallout",
            stroke
          })
        );
        const headCy = kids.length ? bh * (last ? 0.54 : 0.351) : bh * (last ? 1 : 0.65);
        heads.push({ node, box: { x: 0, y, cx: frameCx, cy: headCy } });
        if (kids.length) {
          const top = y + bh * (last ? 0.52 : 0.351);
          const cy = bh * (last ? 0.46 : 0.299);
          const cw = frameCx / kids.length;
          kids.forEach((kid, k) => {
            cells.push({ node: kid, box: { x: k * cw, y: top, cx: cw, cy } });
          });
        }
        y += bh - unit * OVER;
      });
      const headPt = Math.min(
        ...heads.map((h) => h.node.sizePt ?? fitSizeW(h.box.cy * 0.78, h.box.cx, h.node.texts, 65))
      );
      const cellPt = cells.length ? Math.min(
        ...cells.map(
          (c) => c.node.sizePt ?? fitSizeW(c.box.cy * 0.8, c.box.cx, c.node.texts, 65)
        )
      ) : 0;
      for (const c of cells)
        sps.push(
          dgmSp(
            c.box,
            cellFill,
            c.node.texts.map((tx) => ({ text: tx, lvl: 0, sizePt: cellPt })),
            { stroke, textColor: "#000000" }
          )
        );
      for (const h of heads)
        sps.push(
          dgmSp(
            h.box,
            "#000000",
            h.node.texts.map((tx) => ({ text: tx, lvl: 0, sizePt: headPt })),
            { noFill: true }
          )
        );
    } else if (family === "procCards") {
      const n = roots.length;
      const gapX = frameCx * 0.1;
      const iw = (frameCx - gapX * (n - 1)) / n;
      const ih = Math.min(frameCy * 0.5, iw * 1.1);
      const y00 = (frameCy - ih) / 2;
      roots.forEach((node, i) => {
        const x = i * (iw + gapX);
        const base = colorOf(node, i);
        const baseHex = typeof base === "string" ? base : "#4472C4";
        const titleCy = ih * 0.42;
        sps.push(
          dgmSp(
            { x, y: y00, cx: iw * 0.62, cy: titleCy },
            base,
            node.texts.map((tx) => ({
              text: tx,
              lvl: 0,
              sizePt: fitSize(titleCy, Math.max(node.texts.length, 1), 18)
            })),
            { prst: "roundRect", align: "l" }
          )
        );
        const bullets = dgmBulletLines(node);
        sps.push(
          dgmSp(
            { x: x + iw * 0.14, y: y00 + titleCy * 0.62, cx: iw * 0.66, cy: ih - titleCy * 0.62 },
            base,
            bullets.map((l) => ({
              text: l.text,
              lvl: l.lvl,
              sizePt: fitSize(ih - titleCy, Math.max(bullets.length, 1) * 1.6, 15)
            })),
            {
              prst: "roundRect",
              textColor: "#333333",
              align: "l",
              anchor: "t",
              noFill: true,
              stroke: baseHex
            }
          )
        );
        if (i < n - 1) {
          const aw = gapX * 0.55;
          sps.push(
            dgmSp(
              { x: x + iw + (gapX - aw) / 2, y: y00 + titleCy * 0.28, cx: aw, cy: titleCy * 0.45 },
              baseHex ? dgmTint(baseHex, 0.45) : base,
              [],
              { prst: "rightArrow" }
            )
          );
        }
      });
    } else if (family === "pyramid") {
      const items = roots;
      const n = items.length;
      const w0 = Math.min(frameCx * 0.62, frameCy * 1.05);
      const x0 = (frameCx - w0) / 2;
      const rowH = frameCy / n;
      items.forEach((node, i) => {
        const botW = w0 * (i + 1) / n;
        const lines = node.texts.map((tx) => ({
          text: tx,
          lvl: 0,
          sizePt: fitSize(rowH, Math.max(node.texts.length, 1), 22)
        }));
        if (i === 0) {
          sps.push(
            dgmSp({ x: x0 + (w0 - botW) / 2, y: 0, cx: botW, cy: rowH }, colorOf(node, i), lines, {
              prst: "triangle",
              textColor: "#333333"
            })
          );
        } else {
          const inset = w0 / (2 * n);
          const adj = inset / Math.min(botW, rowH) * 1e5;
          sps.push(
            dgmSp(
              { x: x0 + (w0 - botW) / 2, y: i * rowH, cx: botW, cy: rowH },
              colorOf(node, i),
              lines,
              { prst: "trapezoid", textColor: "#333333", adj }
            )
          );
        }
      });
    } else if (family === "strips") {
      const n = roots.length;
      const gap = frameCy * 0.05;
      const ih = (frameCy - gap * (n - 1)) / n;
      const x = frameCx * 0.2;
      const w = frameCx * 0.45;
      roots.forEach((node, i) => {
        const base = colorOf(node, i);
        const baseHex = typeof base === "string" ? base : "#4472C4";
        sps.push(
          dgmSp(
            { x, y: i * (ih + gap), cx: w, cy: ih },
            base,
            node.texts.map((tx) => ({
              text: tx,
              lvl: 0,
              sizePt: fitSize(ih, Math.max(node.texts.length, 1) * 1.4, 24)
            })),
            { textColor: "#333333", align: "l", noFill: true, stroke: baseHex }
          )
        );
      });
    } else if (family === "pictureList") {
      const n = roots.length;
      const contCy = frameCy * 0.44;
      const cont = colors[0] ? dgmTint(colors[0], 0.25) : "#DCE3F2";
      sps.push(dgmSp({ x: 0, y: 0, cx: frameCx, cy: contCy }, cont, [], { prst: "roundRect" }));
      const gap = frameCx * 0.03;
      const cw = (frameCx - gap * (n - 1) - frameCx * 0.04) / n;
      roots.forEach((node, i) => {
        const x = frameCx * 0.02 + i * (cw + gap);
        sps.push(
          dgmSp(
            { x, y: contCy * 0.12, cx: cw, cy: contCy * 0.76 },
            colors[0] ? dgmTint(colors[0], 0.12) : "#E8ECF7",
            [],
            { prst: "roundRect" }
          )
        );
        const bullets = dgmBulletLines(node);
        const bodyCy = frameCy - contCy - frameCy * 0.02;
        const t = fitSize(bodyCy, Math.max(node.texts.length + bullets.length, 1), 18);
        sps.push(
          dgmSp(
            { x, y: contCy + frameCy * 0.02, cx: cw, cy: bodyCy },
            colorOf(node, i),
            [
              ...node.texts.map((tx) => ({ text: tx, lvl: 0, sizePt: t })),
              ...bullets.map((l) => ({ text: l.text, lvl: l.lvl, sizePt: t * 0.85 }))
            ],
            { prst: "roundRect", align: "l", anchor: "t" }
          )
        );
      });
    } else if (family === "ruleArrow") {
      const n = Math.max(roots.length, 1);
      const ah = frameCy * 0.9;
      const ay = (frameCy - ah) / 2;
      const headLen = Math.min(frameCx * 0.255, ah * 0.554);
      sps.push(
        dgmSp({ x: 0, y: ay, cx: frameCx, cy: ah }, colorOf(roots[0], 0), [], {
          prst: "rightArrow",
          adjs: [
            { name: "adj1", val: 40400 },
            { name: "adj2", val: Math.round(headLen / Math.min(frameCx, ah) * 1e5) }
          ]
        })
      );
      const bodyW = frameCx - headLen;
      const slot = bodyW / n;
      const shaftH = ah * 0.404;
      roots.forEach((node, i) => {
        sps.push(
          dgmSp(
            { x: i * slot, y: ay + (ah - shaftH) / 2, cx: slot, cy: shaftH },
            "#FFFFFF",
            node.texts.map((tx) => ({
              text: tx,
              lvl: 0,
              sizePt: fitSize(shaftH, Math.max(node.texts.length, 1), 26),
              bold: true
            })),
            { noFill: true }
          )
        );
      });
    } else if (family === "boxList") {
      const n = roots.length;
      const pitch = frameCy / Math.max(n, 1);
      roots.forEach((node, i) => {
        const y = i * pitch + pitch * 0.04;
        const base = colorOf(node, i);
        const baseHex = typeof base === "string" ? base : void 0;
        const titleCy = pitch * 0.7;
        sps.push(
          dgmSp(
            { x: frameCx * 0.053, y, cx: frameCx * 0.692, cy: titleCy },
            base,
            node.texts.map((tx) => ({
              text: tx,
              lvl: 0,
              sizePt: fitSize(titleCy, Math.max(node.texts.length, 1) * 2, 14)
            })),
            { prst: "roundRect", align: "l" }
          )
        );
        const bullets = dgmBulletLines(node);
        const bodyCy = titleCy * 0.9;
        sps.push(
          dgmSp(
            { x: 0, y: y + titleCy * 0.5, cx: frameCx, cy: bodyCy },
            base,
            bullets.map((l) => ({
              text: l.text,
              lvl: l.lvl,
              sizePt: fitSize(bodyCy, Math.max(bullets.length, 1), 16)
            })),
            {
              textColor: "#333333",
              align: "l",
              anchor: "t",
              noFill: true,
              stroke: baseHex ?? "#4472C4"
            }
          )
        );
      });
    } else {
      const n = roots.length;
      const GAP = 0.115;
      const ASPECT = 0.62;
      const availCy = frameCy * 0.98;
      let cols = 1;
      let best = 0;
      for (let c = 1; c <= n; c++) {
        const r = Math.ceil(n / c);
        const w = Math.min(frameCx / (c + (c - 1) * GAP), availCy / (r * ASPECT + (r - 1) * GAP));
        if (w > best) {
          best = w;
          cols = c;
        }
      }
      const rows = Math.ceil(n / cols);
      const bw = best;
      const bh = bw * ASPECT;
      const gap = bw * GAP;
      const gridW = cols * bw + (cols - 1) * gap;
      const gridH = rows * bh + (rows - 1) * gap;
      const xOff = (frameCx - gridW) / 2;
      const yOff = (frameCy - gridH) / 2;
      roots.forEach((node, i) => {
        const row = Math.floor(i / cols);
        const inRow = row === rows - 1 ? n - (rows - 1) * cols : cols;
        const col = i - row * cols;
        const rowW = inRow * bw + (inRow - 1) * gap;
        const x = xOff + (gridW - rowW) / 2 + col * (bw + gap);
        const y = yOff + row * (bh + gap);
        const bullets = dgmBulletLines(node);
        const t = fitSizeW(bh, bw, [...node.texts, ...bullets.map((l) => l.text)]);
        const lines = [
          ...node.texts.map((tx) => ({ text: tx, lvl: 0, sizePt: t })),
          ...bullets.map((l) => ({ text: l.text, lvl: l.lvl, sizePt: t * 0.8 }))
        ];
        sps.push(
          dgmSp({ x, y, cx: bw, cy: bh }, colorOf(node, i), lines, { align: "l", anchor: "ctr" })
        );
      });
    }
    const anchor = { spIndex: -1, originalXml: "", range: [0, 0] };
    const out = [];
    for (const sp of sps) {
      const el = parseSpShape(sp, anchor, ctx);
      if (el.type !== "passthrough") out.push(el);
    }
    return out;
  }
  function collectDgmTexts(pt) {
    const body = pt?.["dgm:t"];
    if (!body || typeof body !== "object") return [];
    const paras = Array.isArray(body["a:p"]) ? body["a:p"] : body["a:p"] ? [body["a:p"]] : [];
    const out = [];
    for (const p of paras) {
      const runs = Array.isArray(p?.["a:r"]) ? p["a:r"] : p?.["a:r"] ? [p["a:r"]] : [];
      const t = runs.map((r) => {
        const v = r?.["a:t"];
        return typeof v === "string" ? v : String(v?.["#text"] ?? "");
      }).join("");
      if (t) out.push(t);
    }
    return out;
  }
  function collectDgmRunSize(pt) {
    const body = pt?.["dgm:t"];
    if (!body || typeof body !== "object") return void 0;
    const p = Array.isArray(body["a:p"]) ? body["a:p"][0] : body["a:p"];
    const r = Array.isArray(p?.["a:r"]) ? p["a:r"][0] : p?.["a:r"];
    const sz = parseInt(r?.["a:rPr"]?.["@_sz"], 10);
    return sz > 0 ? sz / 100 : void 0;
  }
  function findDescendantPic(node, depth = 0) {
    if (!node || typeof node !== "object" || depth > 6) return void 0;
    const pics = node["p:pic"];
    if (Array.isArray(pics) && pics.length) return pics[0];
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith("@_")) continue;
      for (const child of Array.isArray(v) ? v : [v]) {
        const found = findDescendantPic(child, depth + 1);
        if (found) return found;
      }
    }
    return void 0;
  }
  var xsdBool = (v) => {
    const s = String(v ?? "").toLowerCase();
    return s === "1" || s === "true";
  };
  function parseTable(node, tbl, anchor, ctx) {
    const gridRaw = tbl["a:tblGrid"]?.["a:gridCol"];
    const gridCols = Array.isArray(gridRaw) ? gridRaw : gridRaw ? [gridRaw] : [];
    const colWidths = gridCols.map((g) => intOr(g["@_w"], 0));
    const trsRaw = tbl["a:tr"];
    const trs = Array.isArray(trsRaw) ? trsRaw : trsRaw ? [trsRaw] : [];
    if (!colWidths.length || !trs.length) return null;
    const tblPr2 = tbl["a:tblPr"] ?? {};
    const styleIdRaw = tblPr2["a:tableStyleId"];
    const styleId = typeof styleIdRaw === "string" ? styleIdRaw : styleIdRaw?.["#text"];
    const cellsDefineLines = trs.some((tr) => {
      const tcs = tr?.["a:tc"];
      return (Array.isArray(tcs) ? tcs : tcs ? [tcs] : []).some(
        (tc) => ["a:lnL", "a:lnR", "a:lnT", "a:lnB"].some((k) => tc?.["a:tcPr"]?.[k] !== void 0)
      );
    });
    const styleDef = resolveTableStyle(
      styleId ?? (cellsDefineLines ? void 0 : "{5940675A-B579-460E-94D1-54222C63F5DA}"),
      ctx.tableStyles,
      ctx.theme
    );
    let bgFill = styleDef?.tblBg;
    if (!bgFill && styleDef?.tblBgRef) {
      const { idx, phClr } = styleDef.tblBgRef;
      const tpl = idx > 1e3 ? ctx.theme?.bgFillStyles?.[idx - 1001] : ctx.theme?.fillStyles?.[idx - 1];
      bgFill = tpl ? parseFill(tpl, { ...ctx, phClr, mediaRels: ctx.themeMediaRels ?? ctx.mediaRels }) : void 0;
      if (!bgFill && phClr) bgFill = { type: "solid", color: phClr };
    }
    const flags = {
      firstRow: xsdBool(tblPr2["@_firstRow"]),
      lastRow: xsdBool(tblPr2["@_lastRow"]),
      firstCol: xsdBool(tblPr2["@_firstCol"]),
      lastCol: xsdBool(tblPr2["@_lastCol"]),
      bandRow: xsdBool(tblPr2["@_bandRow"]),
      bandCol: xsdBool(tblPr2["@_bandCol"])
    };
    const nRows = trs.length;
    const nCols = colWidths.length;
    const rowHeights = trs.map((tr) => intOr(tr["@_h"], 0));
    const rows = trs.map((tr, r) => {
      const tcsRaw = tr["a:tc"];
      const tcs = Array.isArray(tcsRaw) ? tcsRaw : tcsRaw ? [tcsRaw] : [];
      const gridCols2 = tableRowGridCols(
        tcs.map((tc) => ({
          gridSpan: tc["@_gridSpan"] ? parseInt(tc["@_gridSpan"], 10) || 1 : 1,
          merged: xsdBool(tc["@_hMerge"]) || xsdBool(tc["@_vMerge"])
        }))
      );
      return tcs.map((tc, i) => {
        const c = gridCols2[i];
        const part = styleDef ? cellPartStyle(styleDef, flags, r, c, nRows, nCols) : void 0;
        const inside = styleDef ? cellStyleBorders(styleDef, flags, r, c, nRows, nCols) : void 0;
        return parseTableCell(tc, ctx, part, inside);
      });
    });
    return {
      id: uid("tbl"),
      type: "table",
      anchor,
      transform: parseXfrm(node["p:xfrm"]),
      name: node["p:nvGraphicFramePr"]?.["p:cNvPr"]?.["@_name"],
      colWidths,
      rowHeights,
      rows,
      ...styleId ? { styleId } : {},
      styleFlags: { ...flags },
      ...xsdBool(tblPr2["@_rtl"]) ? { rtl: true } : {},
      ...bgFill && bgFill.type !== "none" ? { bgFill } : {}
    };
  }
  function parseTableCell(tc, ctx, part, inside) {
    const tcPr = tc["a:tcPr"] ?? {};
    const cell = {};
    if (tc["a:txBody"]) {
      const styleChain = part && (part.bold !== void 0 || part.textColor) ? [
        {
          levels: [
            {
              ...part.bold !== void 0 ? { bold: part.bold } : {},
              ...part.textColor ? { color: part.textColor } : {}
            }
          ]
        }
      ] : [];
      if (ctx.defaultTextStyle)
        styleChain.push({ ...ctx.defaultTextStyle, src: "presentation defaultTextStyle" });
      const text = parseTextBody(tc["a:txBody"], ctx, styleChain);
      const anchorMap = { t: "top", ctr: "middle", b: "bottom" };
      if (tcPr["@_anchor"]) text.anchor = anchorMap[tcPr["@_anchor"]];
      text.insets = {
        l: intOr(tcPr["@_marL"], 91440),
        r: intOr(tcPr["@_marR"], 91440),
        t: intOr(tcPr["@_marT"], 45720),
        b: intOr(tcPr["@_marB"], 45720)
      };
      cell.text = text;
    }
    const fill = parseFill(tcPr, ctx);
    if (fill) {
      if (fill.type !== "none") cell.fill = fill;
    } else if (part?.fill) cell.fill = part.fill;
    const cell3D = tcPr["a:cell3D"];
    if (cell3D && typeof cell3D === "object") {
      const bv = cell3D["a:bevel"];
      const preset = bv?.["@_prst"];
      const dir = cell3D["a:lightRig"]?.["@_dir"];
      cell.bevel = {
        widthEmu: intOr(bv?.["@_w"], 76200),
        ...preset ? { preset } : {},
        ...dir ? { lightDir: dir } : {}
      };
    }
    const borders = {};
    for (const [key, tag] of [
      ["l", "a:lnL"],
      ["r", "a:lnR"],
      ["t", "a:lnT"],
      ["b", "a:lnB"]
    ]) {
      const ln = tcPr[tag];
      if (!ln || typeof ln !== "object") continue;
      if (ln["@_w"] === "0" && !("a:noFill" in ln)) continue;
      const stroke = parseStroke({ "a:ln": ln }, ctx);
      if (stroke) borders[key] = stroke;
    }
    for (const k of ["l", "r", "t", "b"]) {
      if (inside?.[k] && !borders[k]) borders[k] = inside[k];
    }
    if (Object.keys(borders).length) cell.borders = borders;
    const gridSpan = tc["@_gridSpan"] ? parseInt(tc["@_gridSpan"], 10) : void 0;
    const rowSpan = tc["@_rowSpan"] ? parseInt(tc["@_rowSpan"], 10) : void 0;
    if (gridSpan && gridSpan > 1) cell.gridSpan = gridSpan;
    if (rowSpan && rowSpan > 1) cell.rowSpan = rowSpan;
    if (xsdBool(tc["@_hMerge"]) || xsdBool(tc["@_vMerge"])) cell.merged = true;
    return cell;
  }
  function passthrough(anchor, kind, node) {
    const spPr = node?.["p:spPr"] ?? node?.["p:grpSpPr"];
    const transform = parseXfrm(spPr?.["a:xfrm"]);
    return { id: uid("pt"), type: "passthrough", anchor, transform, kind };
  }
  function parseXfrm(xfrm) {
    const zero = {
      offset: { x: 0, y: 0, cx: 0, cy: 0 },
      rot: 0,
      flipH: false,
      flipV: false
    };
    if (!xfrm) return zero;
    const off = xfrm["a:off"];
    const ext = xfrm["a:ext"];
    return {
      offset: {
        x: off ? parseInt(off["@_x"], 10) || 0 : 0,
        y: off ? parseInt(off["@_y"], 10) || 0 : 0,
        cx: ext ? parseInt(ext["@_cx"], 10) || 0 : 0,
        cy: ext ? parseInt(ext["@_cy"], 10) || 0 : 0
      },
      rot: xfrm["@_rot"] ? parseInt(xfrm["@_rot"], 10) || 0 : 0,
      flipH: xfrm["@_flipH"] === "1" || xfrm["@_flipH"] === "true",
      flipV: xfrm["@_flipV"] === "1" || xfrm["@_flipV"] === "true"
    };
  }
  function parseLum(blipNode) {
    const lum = blipNode?.["a:lum"];
    if (lum === void 0) return void 0;
    const attrs = lum && typeof lum === "object" ? lum : {};
    const pct = (v) => Math.max(-1, Math.min(1, (v != null ? parseInt(String(v), 10) || 0 : 0) / 1e5));
    const bright = pct(attrs["@_bright"]);
    const contrast = pct(attrs["@_contrast"]);
    if (!bright && !contrast) return void 0;
    return { bright, contrast };
  }
  function parseBiLevel(blipNode) {
    const bl = blipNode?.["a:biLevel"];
    if (bl === void 0) return void 0;
    const thresh = bl && typeof bl === "object" ? intOr(bl["@_thresh"], 5e4) : 5e4;
    return Math.max(0, Math.min(1, thresh / 1e5));
  }
  function parseDuotone(blipNode, ctx) {
    const duoRaw = blipNode?.["a:duotone"];
    if (!duoRaw) return blipNode?.["a:grayscl"] !== void 0 ? ["#000000", "#FFFFFF"] : void 0;
    const clrs = [];
    for (const tag of ["a:schemeClr", "a:srgbClr", "a:prstClr", "a:sysClr"]) {
      const raw = duoRaw[tag];
      const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
      for (const c of arr) {
        const resolved = resolveColorNode2({ [tag]: c }, ctx);
        if (resolved) clrs.push({ c: resolved, tag });
      }
    }
    if (clrs.length < 2) return void 0;
    let pair = clrs.slice(0, 2);
    if (pair[0].tag !== pair[1].tag) {
      const lum = (h) => 0.299 * parseInt(h.slice(1, 3), 16) + 0.587 * parseInt(h.slice(3, 5), 16) + 0.114 * parseInt(h.slice(5, 7), 16);
      pair = [...pair].sort((a, b) => lum(a.c) - lum(b.c));
    }
    return [pair[0].c, pair[1].c];
  }
  function parseClrChange(blipNode, ctx) {
    const cc = blipNode?.["a:clrChange"];
    if (!cc) return void 0;
    const from = resolveColorNode2(cc["a:clrFrom"], ctx);
    const to = resolveColorNode2(cc["a:clrTo"], ctx);
    return from && to ? { from, to } : void 0;
  }
  function parseFill(spPr, ctx) {
    if (!spPr) return void 0;
    if ("a:noFill" in spPr) return { type: "none" };
    if ("a:grpFill" in spPr) return ctx.groupFill;
    const solid2 = spPr["a:solidFill"];
    if (solid2) {
      const color = resolveColorNode2(solid2, ctx);
      if (color) return { type: "solid", color };
    }
    const grad = spPr["a:gradFill"];
    if (grad) return parseGradFill(grad, ctx);
    const blip = spPr["a:blipFill"];
    if (blip) {
      const embedId = blipEmbedId(blip["a:blip"]);
      const mediaRef = blipMediaRef(blip["a:blip"], embedId, ctx);
      if (mediaRef) {
        const alphaAmt = blip["a:blip"]?.["a:alphaModFix"]?.["@_amt"];
        const alpha = alphaAmt != null ? Math.max(0, Math.min(1, parseInt(alphaAmt, 10) / 1e5)) : void 0;
        const duotone = parseDuotone(blip["a:blip"], ctx);
        const clrChange = parseClrChange(blip["a:blip"], ctx);
        const lum = parseLum(blip["a:blip"]);
        const biLevel = parseBiLevel(blip["a:blip"]);
        const fr = blip["a:stretch"]?.["a:fillRect"];
        const pct = (v) => v != null ? (parseInt(String(v), 10) || 0) / 1e5 : 0;
        const fillRect = fr && (fr["@_l"] != null || fr["@_t"] != null || fr["@_r"] != null || fr["@_b"] != null) ? { l: pct(fr["@_l"]), t: pct(fr["@_t"]), r: pct(fr["@_r"]), b: pct(fr["@_b"]) } : void 0;
        const tl = blip["a:tile"];
        const tlAttrs = tl && typeof tl === "object" ? tl : {};
        const tile = tl !== void 0 ? {
          tx: intOr(tlAttrs["@_tx"], 0),
          ty: intOr(tlAttrs["@_ty"], 0),
          sx: intOr(tlAttrs["@_sx"], 1e5) / 1e5,
          sy: intOr(tlAttrs["@_sy"], 1e5) / 1e5,
          algn: String(tlAttrs["@_algn"] ?? "tl")
        } : void 0;
        return {
          type: "image",
          mediaRef,
          mode: "a:tile" in blip ? "tile" : "stretch",
          ...alpha != null && alpha < 1 ? { alpha } : {},
          ...fillRect ? { fillRect } : {},
          ...duotone ? { duotone } : {},
          ...clrChange ? { clrChange } : {},
          ...lum ? { lum } : {},
          ...biLevel != null ? { biLevel } : {},
          ...tile ? { tile } : {}
        };
      }
    }
    const pat = spPr["a:pattFill"];
    if (pat) {
      const fg = resolveColorNode2(pat["a:fgClr"], ctx) ?? "#000000";
      const bg = resolveColorNode2(pat["a:bgClr"], ctx) ?? "#FFFFFF";
      return { type: "pattern", fg, bg, preset: String(pat["@_prst"] ?? "pct50") };
    }
    return void 0;
  }
  function parseGradFill(grad, ctx) {
    const gsLst = grad["a:gsLst"]?.["a:gs"];
    const list = gsLst ? Array.isArray(gsLst) ? gsLst : [gsLst] : [];
    const stops = list.map((gs) => {
      const pos = (parseInt(gs["@_pos"], 10) || 0) / 1e5;
      const color = resolveColorNode2(gs, ctx);
      return color ? { pos, color } : null;
    }).filter((s) => !!s);
    if (!stops.length) return void 0;
    const lin = grad["a:lin"];
    const pathType = grad["a:path"]?.["@_path"];
    const angle = lin != null ? parseInt(lin["@_ang"], 10) || 0 : grad["a:path"] == null ? 54e5 : void 0;
    const scaled = lin != null && (lin["@_scaled"] === "1" || lin["@_scaled"] === "true");
    const ftr = grad["a:path"]?.["a:fillToRect"];
    const frac = (v) => {
      if (v == null) return 0;
      const str = String(v);
      const n = parseFloat(str) || 0;
      return str.trim().endsWith("%") ? n / 100 : n / 1e5;
    };
    const tr = grad["a:tileRect"];
    const tileRect = tr != null && typeof tr === "object" ? { l: frac(tr["@_l"]), t: frac(tr["@_t"]), r: frac(tr["@_r"]), b: frac(tr["@_b"]) } : void 0;
    return {
      type: "gradient",
      stops,
      ...angle != null ? { angle } : {},
      ...scaled ? { scaled: true } : {},
      ...pathType === "circle" || pathType === "rect" || pathType === "shape" ? { path: pathType } : {},
      ...ftr ? {
        fillTo: {
          l: frac(ftr["@_l"]),
          t: frac(ftr["@_t"]),
          r: frac(ftr["@_r"]),
          b: frac(ftr["@_b"])
        }
      } : {},
      ...tileRect && (tileRect.l || tileRect.t || tileRect.r || tileRect.b) ? { tileRect } : {}
    };
  }
  function resolveColorNode2(node, ctx) {
    return resolveColorNode(node, ctx.theme, ctx.phClr);
  }
  var COLOR_NODE_TAGS = [
    "a:srgbClr",
    "a:schemeClr",
    "a:sysClr",
    "a:prstClr",
    "a:hslClr",
    "a:scrgbClr"
  ];
  var xmlAttrEsc = (v) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  function nonPlainColorNode(container) {
    if (container == null) return void 0;
    const srgb = container["a:srgbClr"];
    const srgbPlain = srgb != null && typeof srgb === "object" && !Object.keys(srgb).some((k) => k.startsWith("a:"));
    if (srgbPlain) return void 0;
    return colorNodeXml(container);
  }
  function colorNodeXml(fillNode) {
    for (const tag of COLOR_NODE_TAGS) {
      const n = fillNode?.[tag];
      if (n == null) continue;
      const node = typeof n === "object" ? n : {};
      const attrs = Object.keys(node).filter((k) => k.startsWith("@_")).map((k) => ` ${k.slice(2)}="${xmlAttrEsc(String(node[k]))}"`).join("");
      const kids = Object.keys(node).filter((k) => k.startsWith("a:")).map((k) => {
        const arr = Array.isArray(node[k]) ? node[k] : [node[k]];
        return arr.map((c) => {
          const cAttrs = Object.keys(c ?? {}).filter((x) => x.startsWith("@_")).map((x) => ` ${x.slice(2)}="${xmlAttrEsc(String(c[x]))}"`).join("");
          return `<${k}${cAttrs}/>`;
        }).join("");
      }).join("");
      return kids ? `<${tag}${attrs}>${kids}</${tag}>` : `<${tag}${attrs}/>`;
    }
    return void 0;
  }
  function parseTextBody(txBody, ctx, phChain = [], inheritedInsets) {
    const bodyPrRaw = txBody["a:bodyPr"];
    const bodyPr = bodyPrRaw && typeof bodyPrRaw === "object" ? bodyPrRaw : {};
    const anchorMap = { t: "top", ctr: "middle", b: "bottom" };
    const paras = txBody["a:p"] ? Array.isArray(txBody["a:p"]) ? txBody["a:p"] : [txBody["a:p"]] : [];
    const ownStyle = parseLstStyleLevels(txBody["a:lstStyle"], ctx.theme, {
      mediaRels: ctx.mediaRels
    });
    const chain = [
      ownStyle ? { ...ownStyle, src: "shape lstStyle" } : void 0,
      ...phChain
    ];
    const paragraphs = paras.map((p) => parseParagraph(p, ctx, chain));
    let autofit = "none";
    if ("a:normAutofit" in bodyPr) autofit = "shrink";
    else if ("a:spAutoFit" in bodyPr) autofit = "resize";
    const naf = bodyPr["a:normAutofit"];
    const nafAttr = (k) => {
      const v = naf && typeof naf === "object" ? naf[k] : void 0;
      const n = v != null ? parseInt(String(v), 10) : NaN;
      return Number.isFinite(n) && n > 0 ? n / 1e5 : void 0;
    };
    const fontScale = nafAttr("@_fontScale");
    const lnSpcReduction = nafAttr("@_lnSpcReduction");
    const vertRaw = bodyPr["@_vert"];
    const vert = vertRaw === "eaVert" || vertRaw === "vert" || vertRaw === "vert270" || vertRaw === "wordArtVert" ? vertRaw : void 0;
    let extrusion3d;
    const bodySp3d = bodyPr["a:sp3d"];
    const depthEmu = bodySp3d ? intOr(bodySp3d["@_extrusionH"], 0) : 0;
    if (depthEmu > 0) {
      const extClr = bodySp3d["a:extrusionClr"];
      const color = (extClr && typeof extClr === "object" ? resolveColorNode2(extClr, ctx) : void 0) ?? "#808080";
      const rot = bodyPr["a:scene3d"]?.["a:camera"]?.["a:rot"];
      extrusion3d = {
        color,
        depthEmu,
        latDeg: intOr(rot?.["@_lat"], 0) / 6e4,
        lonDeg: intOr(rot?.["@_lon"], 0) / 6e4
      };
    }
    let txWarp;
    const warpNode = bodyPr["a:prstTxWarp"];
    if (warpNode && typeof warpNode === "object" && warpNode["@_prst"]) {
      const prst = String(warpNode["@_prst"]);
      if (prst !== "textNoShape" && prst !== "textPlain") {
        const adj = {};
        const gds = warpNode["a:avLst"]?.["a:gd"];
        for (const gd of Array.isArray(gds) ? gds : gds ? [gds] : []) {
          const m = /^val (-?\d+)$/.exec(String(gd["@_fmla"] ?? ""));
          if (gd["@_name"] && m) adj[String(gd["@_name"])] = parseInt(m[1], 10);
        }
        txWarp = { prst, ...Object.keys(adj).length ? { adj } : {} };
      }
    }
    return {
      paragraphs,
      anchor: bodyPr["@_anchor"] ? anchorMap[bodyPr["@_anchor"]] : void 0,
      ...bodyPr["@_anchorCtr"] != null ? { anchorCtr: String(bodyPr["@_anchorCtr"]) === "1" || bodyPr["@_anchorCtr"] === "true" } : {},
      insets: {
        l: intOr(bodyPr["@_lIns"], inheritedInsets?.l ?? DEFAULT_BODY_INSETS.l),
        t: intOr(bodyPr["@_tIns"], inheritedInsets?.t ?? DEFAULT_BODY_INSETS.t),
        r: intOr(bodyPr["@_rIns"], inheritedInsets?.r ?? DEFAULT_BODY_INSETS.r),
        b: intOr(bodyPr["@_bIns"], inheritedInsets?.b ?? DEFAULT_BODY_INSETS.b)
      },
      autofit,
      ...fontScale != null ? { fontScale } : {},
      ...lnSpcReduction != null ? { lnSpcReduction } : {},
      wrap: bodyPr["@_wrap"] !== "none",
      ...vert ? { vert } : {},
      ...intOr(bodyPr["@_numCol"], 1) > 1 ? { numCol: intOr(bodyPr["@_numCol"], 1), spcCol: intOr(bodyPr["@_spcCol"], 0) } : {},
      ...extrusion3d ? { extrusion3d } : {},
      ...txWarp ? { txWarp } : {}
    };
  }
  function spcPct(node) {
    const v = node?.["a:spcPct"]?.["@_val"];
    return v != null ? (parseInt(v, 10) || 0) / 1e3 : void 0;
  }
  function spcPts(node) {
    const v = node?.["a:spcPts"]?.["@_val"];
    return v != null ? (parseInt(v, 10) || 0) / 100 : void 0;
  }
  function parseParagraph(p, ctx, chain = []) {
    const pPr = p["a:pPr"] ?? {};
    const alignMap = {
      l: "left",
      ctr: "center",
      r: "right",
      just: "justify"
    };
    const parsedLevel = pPr["@_lvl"] ? parseInt(pPr["@_lvl"], 10) : void 0;
    const level = parsedLevel != null && Number.isFinite(parsedLevel) ? Math.max(0, Math.min(8, parsedLevel)) : void 0;
    const dflt = mergeTextStyleChain(chain, level ?? 0);
    const defRPrNode = pPr["a:defRPr"];
    const paraStyle = parseDefRPrStyle(defRPrNode, ctx.theme, ctx.phClr);
    const runDflt = paraStyle ? { ...dflt, ...paraStyle, src: paragraphSources(dflt, paraStyle) } : dflt;
    if (runDflt && paraStyle?.eaFont && !paraStyle.eaFontRef) delete runDflt.eaFontRef;
    if (runDflt && paraStyle?.latinFont && !paraStyle.latinFontRef) delete runDflt.latinFontRef;
    const defRPr = paraStyle ? parseParagraphDefRPr(defRPrNode, paraStyle) : void 0;
    const runsRaw = p["a:r"] ? Array.isArray(p["a:r"]) ? p["a:r"] : [p["a:r"]] : [];
    const runs = runsRaw.map((r) => {
      const run = parseRun(r, ctx, runDflt);
      if (r?.["@_type"]) run.field = String(r["@_type"]);
      if (r?.["@_gxRaw"]) run.rawXml = base64ToUtf8(String(r["@_gxRaw"]));
      return run;
    });
    const fldsRaw = p["a:fld"] ? Array.isArray(p["a:fld"]) ? p["a:fld"] : [p["a:fld"]] : [];
    for (const f of fldsRaw) {
      const run = parseRun(f, ctx, runDflt);
      if (f?.["@_type"]) run.field = String(f["@_type"]);
      runs.push(run);
    }
    const endPr = p["a:endParaRPr"];
    if (endPr && typeof endPr === "object" && runs.every((r) => !r.text && !r.field && !r.rawXml)) {
      const mark = parseRun({ "a:rPr": endPr, "a:t": "" }, ctx, runDflt);
      mark.paraMark = true;
      runs.splice(0, runs.length, mark);
    }
    const lnSpcNode = pPr["a:lnSpc"];
    const lineHeight = lnSpcNode ? spcPct(lnSpcNode) : dflt?.lineHeight;
    const lineExact = lnSpcNode ? spcPts(lnSpcNode) : dflt?.lineExact;
    const befNode = pPr["a:spcBef"];
    const spaceBefore = befNode ? spcPts(befNode) : dflt?.spaceBefore;
    const spaceBeforePct = befNode ? spcPct(befNode) : dflt?.spaceBeforePct;
    const aftNode = pPr["a:spcAft"];
    const spaceAfter = aftNode ? spcPts(aftNode) : dflt?.spaceAfter;
    const spaceAfterPct = aftNode ? spcPct(aftNode) : dflt?.spaceAfterPct;
    let bullet;
    if (pPr["a:buNone"] !== void 0) bullet = { type: "none" };
    else if (pPr["a:buChar"]?.["@_char"] != null) {
      bullet = { type: "char", char: decodeNumericCharRefs(String(pPr["a:buChar"]["@_char"])) };
    } else if (pPr["a:buAutoNum"]) {
      bullet = { type: "number" };
      if (pPr["a:buAutoNum"]["@_type"]) bullet.numType = String(pPr["a:buAutoNum"]["@_type"]);
      const startAt = parseInt(pPr["a:buAutoNum"]["@_startAt"], 10);
      if (Number.isFinite(startAt) && startAt > 1) bullet.startAt = startAt;
    } else if (pPr["a:buBlip"] !== void 0) {
      bullet = { type: "blip" };
      const embed = blipEmbedId(pPr["a:buBlip"]?.["a:blip"]);
      if (embed) {
        bullet.blipEmbedId = embed;
        const ref = ctx.mediaRels?.get(embed);
        if (ref) bullet.mediaRef = ref;
      }
    }
    if (bullet && bullet.type !== "none") {
      if (pPr["a:buClr"]) {
        const c = resolveColorNode2(pPr["a:buClr"], ctx);
        if (c) bullet.color = c;
        const node = nonPlainColorNode(pPr["a:buClr"]);
        if (node) bullet.colorNodeXml = node;
      }
      if (pPr["a:buFont"]?.["@_typeface"]) bullet.font = String(pPr["a:buFont"]["@_typeface"]);
      if (pPr["a:buSzPct"]?.["@_val"]) {
        const v = parseInt(pPr["a:buSzPct"]["@_val"], 10);
        if (Number.isFinite(v)) bullet.sizePct = v / 1e3;
      }
      if (pPr["a:buSzPts"]?.["@_val"]) {
        const v = parseInt(pPr["a:buSzPts"]["@_val"], 10);
        if (Number.isFinite(v)) bullet.sizePt = v / 100;
      }
    }
    const marLRaw = pPr["@_marL"] != null ? parseInt(pPr["@_marL"], 10) : void 0;
    const marRRaw = pPr["@_marR"] != null ? parseInt(pPr["@_marR"], 10) : void 0;
    const indentRaw = pPr["@_indent"] != null ? parseInt(pPr["@_indent"], 10) : void 0;
    const defTabSzRaw = pPr["@_defTabSz"] != null ? parseInt(pPr["@_defTabSz"], 10) : void 0;
    const tabNodes = pPr["a:tabLst"]?.["a:tab"];
    const tabStops = (Array.isArray(tabNodes) ? tabNodes : tabNodes ? [tabNodes] : []).map((t) => ({
      pos: parseInt(t["@_pos"], 10),
      ...t["@_algn"] ? { algn: String(t["@_algn"]) } : {}
    })).filter((t) => Number.isFinite(t.pos)).sort((a, b) => a.pos - b.pos);
    let effBullet = bullet ?? dflt?.bullet;
    if (!bullet && effBullet && effBullet.type !== "none") {
      const tx = (k) => pPr[k] !== void 0;
      if (tx("a:buFontTx") || tx("a:buSzTx") || tx("a:buClrTx")) {
        effBullet = { ...effBullet };
        if (tx("a:buFontTx")) delete effBullet.font;
        if (tx("a:buSzTx")) {
          delete effBullet.sizePct;
          delete effBullet.sizePt;
        }
        if (tx("a:buClrTx")) delete effBullet.color;
      }
    }
    const hasMarL = marLRaw != null && !Number.isNaN(marLRaw);
    const hasMarR = marRRaw != null && !Number.isNaN(marRRaw);
    const hasIndent = indentRaw != null && !Number.isNaN(indentRaw);
    const hasDefTabSz = defTabSzRaw != null && !Number.isNaN(defTabSzRaw);
    const marL = hasMarL ? marLRaw : dflt?.marL;
    const indent = hasIndent ? indentRaw : dflt?.indent;
    const rtlAttr = pPr["@_rtl"];
    const rtl = rtlAttr === "1" || rtlAttr === "true" ? true : rtlAttr === "0" || rtlAttr === "false" ? false : void 0;
    const hangAttr = pPr["@_hangingPunct"];
    const hangingOff = hangAttr === "0" || hangAttr === "false";
    const latinLnBrk = pPr["@_latinLnBrk"] === "1" || pPr["@_latinLnBrk"] === "true";
    const eaLnBrkOff = pPr["@_eaLnBrk"] === "0" || pPr["@_eaLnBrk"] === "false";
    const pPrExplicit = {
      ...pPr["@_algn"] ? { align: true } : {},
      ...lnSpcNode ? { lnSpc: true } : {},
      ...befNode ? { spcBef: true } : {},
      ...aftNode ? { spcAft: true } : {},
      ...bullet ? { bullet: true } : {},
      ...hasMarL ? { marL: true } : {},
      ...hasMarR ? { marR: true } : {},
      ...hasIndent ? { indent: true } : {},
      ...tabStops.length ? { tabLst: true } : {},
      ...hasDefTabSz ? { defTabSz: true } : {}
    };
    return {
      runs,
      align: pPr["@_algn"] ? alignMap[pPr["@_algn"]] : dflt?.align,
      ...pPr["@_algn"] || dflt?.align != null ? { alignSrc: pPr["@_algn"] ? "paragraph" : dflt?.src?.align ?? "inherited" } : {},
      ...rtl != null ? { rtl } : {},
      ...hangingOff ? { hangingPunct: false } : {},
      ...latinLnBrk ? { latinLnBrk: true } : {},
      ...eaLnBrkOff ? { eaLnBrk: false } : {},
      level,
      pPrExplicit,
      ...lineHeight != null ? { lineHeight } : {},
      ...lineExact != null ? { lineExact } : {},
      ...spaceBefore != null ? { spaceBefore } : {},
      ...spaceAfter != null ? { spaceAfter } : {},
      ...spaceBeforePct != null ? { spaceBeforePct } : {},
      ...spaceAfterPct != null ? { spaceAfterPct } : {},
      ...effBullet ? { bullet: effBullet } : {},
      ...marL != null ? { marL } : {},
      ...hasMarR ? { marR: marRRaw } : {},
      ...indent != null ? { indent } : {},
      ...tabStops.length ? { tabStops } : {},
      ...hasDefTabSz ? { defTabSz: defTabSzRaw } : {},
      ...defRPr ? { defRPr } : {}
    };
  }
  function parseParagraphDefRPr(defRPrNode, style) {
    const typeface2 = (slot) => {
      const v = defRPrNode?.[slot]?.["@_typeface"];
      return v != null && v !== "" ? String(v) : void 0;
    };
    const latinFont = typeface2("a:latin");
    const eaFont = typeface2("a:ea");
    const csFont = typeface2("a:cs");
    const colorNode = nonPlainColorNode(defRPrNode?.["a:solidFill"]);
    return {
      ...style.fontSize != null ? { fontSize: style.fontSize } : {},
      ...style.bold != null ? { bold: style.bold } : {},
      ...style.italic != null ? { italic: style.italic } : {},
      ...style.cap != null ? { cap: style.cap } : {},
      ...style.color != null ? { color: style.color } : {},
      ...colorNode ? { colorNodeXml: colorNode } : {},
      ...latinFont ? { latinFont } : {},
      ...eaFont ? { eaFont } : {},
      ...csFont ? { csFont } : {}
    };
  }
  var CJK_RE = /[\u1100-\u11ff\u2e80-\u303e\u3041-\u33ff\u3400-\u9fff\ua960-\ua97f\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]/;
  var CS_RE = /[\u0590-\u07bf\u08a0-\u08ff\u0900-\u0dff\u0e00-\u0eff\u1000-\u109f\u1780-\u17ff\ufb1d-\ufdff\ufe70-\ufeff]/;
  var SOURCE_FIELDS = [
    "fontSize",
    "bold",
    "italic",
    "color",
    "latinFont",
    "eaFont",
    "csFont",
    "align"
  ];
  function paragraphSources(dflt, paraStyle) {
    const src = { ...dflt?.src };
    for (const field of SOURCE_FIELDS) {
      if (paraStyle[field] != null) src[field] = "paragraph defRPr";
    }
    return src;
  }
  function themeFontSource(ref) {
    if (!ref?.startsWith("+")) return void 0;
    return ref.startsWith("+mj") ? "theme major" : "theme minor";
  }
  function parseRun(r, ctx, dflt) {
    const rPr = r["a:rPr"] ?? {};
    const rawT = r["a:t"];
    const text = decodeNumericCharRefs(
      typeof rawT === "string" ? rawT : rawT == null ? "" : typeof rawT === "object" ? String(rawT["#text"] ?? "") : String(rawT)
    );
    const hlink = rPr["a:hlinkClick"];
    const hlinkNamedAction = namedActionOf(hlink?.["@_action"] ? String(hlink["@_action"]) : null);
    const hlinkTarget = hlinkNamedAction ? `action:${hlinkNamedAction}` : hlink?.["@_r:id"] ? ctx.hlinkRels?.get(String(hlink["@_r:id"])) : void 0;
    const fill = rPr["a:solidFill"];
    let gradient;
    if (rPr["a:gradFill"] && typeof rPr["a:gradFill"] === "object") {
      const g = parseFill(rPr, ctx);
      if (g?.type === "gradient" && g.stops.length) {
        gradient = {
          stops: g.stops,
          ...g.angle != null ? { angle: g.angle } : {},
          ...g.scaled ? { scaled: true } : {}
        };
      }
    }
    const color = (fill ? resolveColorNode2(fill, ctx) : void 0) ?? gradient?.stops[Math.floor(gradient.stops.length / 2)]?.color ?? (hlinkTarget ? ctx.theme?.colors?.hlink : void 0) ?? dflt?.color;
    const srgb = fill?.["a:srgbClr"];
    const srgbHasMods = srgb != null && typeof srgb === "object" && Object.keys(srgb).some((k) => k.startsWith("a:"));
    const colorFollowsTheme = color != null && (!(fill && srgb) || srgbHasMods);
    const colorInherited = color != null && !fill;
    const highlightNode = rPr["a:highlight"];
    const highlight = highlightNode ? resolveColorNode2(highlightNode, ctx) : void 0;
    const langScript = eaScriptOfLang;
    const runLangScript = langScript(rPr["@_altLang"]) ?? langScript(rPr["@_lang"]);
    const eaScript = runLangScript ?? (/[\u3040-\u30ff\u31f0-\u31ff]/.test(text) ? "ja" : /[\uac00-\ud7af\u1100-\u11ff]/.test(text) ? "ko" : void 0) ?? dflt?.eaScript ?? (/[\u3400-\u9fff\uf900-\ufaff]/.test(text) ? "han" : void 0);
    const latin = resolveFontRef(rPr["a:latin"]?.["@_typeface"], ctx.theme, eaScript) ?? dflt?.latinFont;
    const ea = resolveFontRef(rPr["a:ea"]?.["@_typeface"] ?? dflt?.eaFontRef, ctx.theme, eaScript) ?? dflt?.eaFont;
    const cs = resolveFontRef(rPr["a:cs"]?.["@_typeface"], ctx.theme, eaScript) ?? dflt?.csFont;
    const sym = resolveFontRef(rPr["a:sym"]?.["@_typeface"], ctx.theme);
    const puaOnly = sym != null && /^[\uf000-\uf0ff]+$/.test(text.replace(/\s+/g, "")) && !!text.trim();
    const CHARSET_SCRIPT = {
      128: "ja",
      // SHIFTJIS
      129: "ko",
      // HANGUL
      130: "ko",
      // JOHAB
      134: "sc",
      // GB2312
      136: "tc"
      // CHINESEBIG5
    };
    const charsetOf = (bucket) => {
      if (runLangScript) return runLangScript;
      if (rPr[bucket]?.["@_typeface"] == null) return void 0;
      const v = rPr[bucket]["@_charset"];
      if (v == null) return void 0;
      const n = parseInt(String(v), 10);
      return Number.isFinite(n) ? CHARSET_SCRIPT[n & 255] : void 0;
    };
    const charsetAttrOf = (bucket) => {
      const v = rPr[bucket]?.["@_charset"];
      if (rPr[bucket]?.["@_typeface"] == null || v == null) return void 0;
      const n = parseInt(String(v), 10);
      return Number.isFinite(n) ? CHARSET_SCRIPT[n & 255] : void 0;
    };
    const csPair = cs != null ? { f: cs, cset: charsetOf("a:cs"), decl: charsetAttrOf("a:cs") } : void 0;
    const eaPair = ea != null ? { f: ea, cset: charsetOf("a:ea"), decl: charsetAttrOf("a:ea") } : void 0;
    const latinPair = latin != null ? { f: latin, cset: charsetOf("a:latin"), decl: charsetAttrOf("a:latin") } : void 0;
    const picked = puaOnly ? sym != null ? { f: sym, cset: void 0, decl: void 0 } : void 0 : (CS_RE.test(text) ? csPair ?? latinPair ?? eaPair : CJK_RE.test(text) ? eaPair ?? latinPair : latinPair ?? eaPair) ?? (ctx.theme?.minorFont != null ? { f: ctx.theme.minorFont, cset: void 0, decl: void 0 } : void 0);
    const fontFamily = picked?.f;
    const latinFamily = picked && picked === eaPair && latinPair && latinPair.f !== picked.f ? latinPair.f : void 0;
    const fontScriptHint = CJK_RE.test(text) ? picked?.cset : picked?.decl;
    const bAttr = rPr["@_b"];
    const iAttr = rPr["@_i"];
    let outline;
    const lnNode = rPr["a:ln"];
    if (lnNode && typeof lnNode === "object" && lnNode["a:solidFill"]) {
      const lnColor = resolveColorNode2(lnNode["a:solidFill"], ctx);
      if (lnColor) {
        const w = lnNode["@_w"] != null ? parseInt(lnNode["@_w"], 10) : 9525;
        outline = { color: lnColor, widthEmu: Number.isFinite(w) ? w : 9525 };
      }
    }
    const runShadow = parseShadow(rPr, ctx) ?? dflt?.shadow;
    const runGlow = parseGlow(rPr, ctx);
    const reflection = rPr["a:effectLst"]?.["a:reflection"] != null;
    const uAttr = rPr["@_u"];
    const strikeAttr = rPr["@_strike"];
    const hasStrike = strikeAttr !== void 0 && strikeAttr !== "noStrike";
    const latinRaw = rPr["a:latin"]?.["@_typeface"];
    const eaRaw = rPr["a:ea"]?.["@_typeface"];
    const csRaw = rPr["a:cs"]?.["@_typeface"];
    const linkUnderline = hlinkTarget != null && uAttr === void 0;
    const inherited = (field, has) => has ? dflt?.src?.[field] ?? "inherited" : "default";
    const fontSource = () => {
      if (picked === void 0) return "default";
      if (puaOnly) return "run";
      const slot = picked === csPair ? "a:cs" : picked === eaPair ? "a:ea" : picked === latinPair ? "a:latin" : null;
      if (slot === null) return "theme minor";
      const own = rPr[slot]?.["@_typeface"];
      if (own != null) return themeFontSource(String(own)) ?? "run";
      const ref = slot === "a:latin" ? dflt?.latinFontRef : slot === "a:ea" ? dflt?.eaFontRef : void 0;
      const layer = slot === "a:latin" ? dflt?.src?.latinFont : slot === "a:ea" ? dflt?.src?.eaFont : dflt?.src?.csFont;
      return [themeFontSource(ref), layer ?? "inherited"].filter(Boolean).join(" via ");
    };
    const styleSrc = {
      fontSize: rPr["@_sz"] ? "run" : inherited("fontSize", dflt?.fontSize != null),
      bold: bAttr != null ? "run" : inherited("bold", dflt?.bold != null),
      italic: iAttr != null ? "run" : inherited("italic", dflt?.italic != null),
      color: fill || gradient ? "run" : hlinkTarget && ctx.theme?.colors?.hlink ? "theme hlink" : inherited("color", dflt?.color != null),
      fontFamily: fontSource()
    };
    return {
      text,
      styleSrc,
      bold: bAttr != null ? bAttr === "1" || bAttr === "true" : !!dflt?.bold,
      ...bAttr == null ? { boldImplicit: true } : {},
      italic: iAttr != null ? iAttr === "1" || iAttr === "true" : !!dflt?.italic,
      ...iAttr == null ? { italicImplicit: true } : {},
      ...(() => {
        const cap = rPr["@_cap"] != null ? String(rPr["@_cap"]) : dflt?.cap;
        return cap && cap !== "none" ? { cap } : {};
      })(),
      ...rPr["@_cap"] != null ? { capExplicit: String(rPr["@_cap"]) } : {},
      underline: uAttr !== void 0 && uAttr !== "none" || linkUnderline,
      ...uAttr !== void 0 && uAttr !== "none" ? { underlineStyle: String(uAttr) } : {},
      ...uAttr === "none" ? { underlineExplicitNone: true } : {},
      ...linkUnderline ? { underlineImplicit: true } : {},
      ...hasStrike ? { strike: true, strikeStyle: String(strikeAttr) } : {},
      ...strikeAttr === "noStrike" ? { strikeExplicitNone: true } : {},
      ...latinRaw ? { latinFont: String(latinRaw) } : {},
      ...eaRaw ? { eaFont: String(eaRaw) } : {},
      ...csRaw ? { csFont: String(csRaw) } : {},
      ...!latinRaw && !eaRaw ? { fontImplicit: true } : {},
      fontSize: rPr["@_sz"] ? parseInt(rPr["@_sz"], 10) / 100 : dflt?.fontSize,
      ...rPr["@_sz"] ? {} : { fontSizeImplicit: true },
      ...rPr["@_spc"] ? { letterSpacing: parseInt(rPr["@_spc"], 10) / 100 } : {},
      ...rPr["@_kern"] != null ? { kern: (parseInt(rPr["@_kern"], 10) || 0) / 100 } : {},
      ...rPr["@_baseline"] ? { baseline: parseInt(rPr["@_baseline"], 10) / 1e3 } : {},
      fontFamily,
      ...latinFamily ? { latinFamily } : {},
      ...fontScriptHint != null ? { fontScriptHint } : {},
      color,
      ...colorFollowsTheme ? { colorFollowsTheme } : {},
      // Captured independent of resolution (a themeless parse still must not bake values in)
      ...fill && !(srgb != null && !srgbHasMods) ? (() => {
        const raw = colorNodeXml(fill);
        return raw ? { colorNodeXml: raw } : {};
      })() : {},
      ...colorInherited ? { colorInherited } : {},
      ...highlight ? { highlight } : {},
      ...outline ? { outline } : {},
      ...runShadow ? { shadow: runShadow } : {},
      ...gradient ? { gradient } : {},
      ...runGlow ? { glow: runGlow } : {},
      ...reflection ? { reflection: true } : {},
      ...hlink && (hlink["@_r:id"] != null || hlinkNamedAction) ? {
        hyperlinkRId: String(hlink["@_r:id"] ?? ""),
        ...hlinkTarget ? { hyperlink: hlinkTarget } : {},
        ...hlink["@_action"] ? { hyperlinkAction: String(hlink["@_action"]) } : {},
        ...hlink["@_tooltip"] ? { hyperlinkTooltip: String(hlink["@_tooltip"]) } : {}
      } : {}
    };
  }
  function parseDecorations(xml, ctx, opts = {}) {
    let scan;
    try {
      scan = scanSlide(xml);
    } catch {
      return [];
    }
    const out = [];
    scan.elements.forEach((sp, idx) => {
      const fragXml = xml.slice(sp.start, sp.end);
      const anchor = { spIndex: -(idx + 1), originalXml: "", range: [0, 0] };
      const el = parseShapeFragment(sp, fragXml, anchor, ctx);
      if (!el || el.type === "passthrough") return;
      const ph = el.placeholder;
      if (ph !== void 0) {
        if (!opts.hfTypes?.has(ph)) return;
      } else if (/<p:ph[\s/>]/.test(fragXml) || opts.hideShapes) {
        return;
      }
      if (opts.slideNum != null) substituteSlideNum(el, opts.slideNum);
      out.push(el);
    });
    return out;
  }
  function substituteSlideNum(el, num) {
    if (el.type === "group") {
      for (const c of el.children) substituteSlideNum(c, num);
      return;
    }
    const text = el.text;
    if (!text) return;
    for (const p of text.paragraphs) {
      for (const r of p.runs) {
        if (r.field === "slidenum") r.text = String(num);
      }
    }
  }
  function intOr(v, dflt) {
    if (v === void 0 || v === null) return dflt;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? dflt : n;
  }

  // ../genoffice/packages/pptx-engine/src/preset-shape-types.ts
  var PRESET_SHAPE_TYPES = [
    "line",
    "lineInv",
    "triangle",
    "rtTriangle",
    "rect",
    "diamond",
    "parallelogram",
    "trapezoid",
    "nonIsoscelesTrapezoid",
    "pentagon",
    "hexagon",
    "heptagon",
    "octagon",
    "decagon",
    "dodecagon",
    "star4",
    "star5",
    "star6",
    "star7",
    "star8",
    "star10",
    "star12",
    "star16",
    "star24",
    "star32",
    "roundRect",
    "round1Rect",
    "round2SameRect",
    "round2DiagRect",
    "snipRoundRect",
    "snip1Rect",
    "snip2SameRect",
    "snip2DiagRect",
    "plaque",
    "ellipse",
    "teardrop",
    "homePlate",
    "chevron",
    "pieWedge",
    "pie",
    "blockArc",
    "donut",
    "noSmoking",
    "rightArrow",
    "leftArrow",
    "upArrow",
    "downArrow",
    "stripedRightArrow",
    "notchedRightArrow",
    "bentUpArrow",
    "leftRightArrow",
    "upDownArrow",
    "leftUpArrow",
    "leftRightUpArrow",
    "quadArrow",
    "leftArrowCallout",
    "rightArrowCallout",
    "upArrowCallout",
    "downArrowCallout",
    "leftRightArrowCallout",
    "upDownArrowCallout",
    "quadArrowCallout",
    "bentArrow",
    "uturnArrow",
    "circularArrow",
    "leftCircularArrow",
    "leftRightCircularArrow",
    "curvedRightArrow",
    "curvedLeftArrow",
    "curvedUpArrow",
    "curvedDownArrow",
    "swooshArrow",
    "cube",
    "can",
    "lightningBolt",
    "heart",
    "sun",
    "moon",
    "smileyFace",
    "irregularSeal1",
    "irregularSeal2",
    "foldedCorner",
    "bevel",
    "frame",
    "halfFrame",
    "corner",
    "diagStripe",
    "chord",
    "arc",
    "leftBracket",
    "rightBracket",
    "leftBrace",
    "rightBrace",
    "bracketPair",
    "bracePair",
    "straightConnector1",
    "bentConnector2",
    "bentConnector3",
    "bentConnector4",
    "bentConnector5",
    "curvedConnector2",
    "curvedConnector3",
    "curvedConnector4",
    "curvedConnector5",
    "callout1",
    "callout2",
    "callout3",
    "accentCallout1",
    "accentCallout2",
    "accentCallout3",
    "borderCallout1",
    "borderCallout2",
    "borderCallout3",
    "accentBorderCallout1",
    "accentBorderCallout2",
    "accentBorderCallout3",
    "wedgeRectCallout",
    "wedgeRoundRectCallout",
    "wedgeEllipseCallout",
    "cloudCallout",
    "cloud",
    "ribbon",
    "ribbon2",
    "ellipseRibbon",
    "ellipseRibbon2",
    "leftRightRibbon",
    "verticalScroll",
    "horizontalScroll",
    "wave",
    "doubleWave",
    "plus",
    "flowChartProcess",
    "flowChartDecision",
    "flowChartInputOutput",
    "flowChartPredefinedProcess",
    "flowChartInternalStorage",
    "flowChartDocument",
    "flowChartMultidocument",
    "flowChartTerminator",
    "flowChartPreparation",
    "flowChartManualInput",
    "flowChartManualOperation",
    "flowChartConnector",
    "flowChartPunchedCard",
    "flowChartPunchedTape",
    "flowChartSummingJunction",
    "flowChartOr",
    "flowChartCollate",
    "flowChartSort",
    "flowChartExtract",
    "flowChartMerge",
    "flowChartOfflineStorage",
    "flowChartOnlineStorage",
    "flowChartMagneticTape",
    "flowChartMagneticDisk",
    "flowChartMagneticDrum",
    "flowChartDisplay",
    "flowChartDelay",
    "flowChartAlternateProcess",
    "flowChartOffpageConnector",
    "actionButtonBlank",
    "actionButtonHome",
    "actionButtonHelp",
    "actionButtonInformation",
    "actionButtonForwardNext",
    "actionButtonBackPrevious",
    "actionButtonEnd",
    "actionButtonBeginning",
    "actionButtonReturn",
    "actionButtonDocument",
    "actionButtonSound",
    "actionButtonMovie",
    "gear6",
    "gear9",
    "funnel",
    "mathPlus",
    "mathMinus",
    "mathMultiply",
    "mathDivide",
    "mathEqual",
    "mathNotEqual",
    "cornerTabs",
    "squareTabs",
    "plaqueTabs",
    "chartX",
    "chartStar",
    "chartPlus"
  ];
  var SET = new Set(PRESET_SHAPE_TYPES);

  // ../genoffice/packages/pptx-engine/src/generate.ts
  var FONT_SLOTS = ["a:latin", "a:ea", "a:cs"];
  var IS_FONT_SLOT = new Set(FONT_SLOTS);

  // ../genoffice/packages/pptx-engine/src/animation.ts
  var PRESET = {
    appear: { id: 1, cls: "entr", sub: 0 },
    fade: { id: 10, cls: "entr", sub: 0 },
    flyIn: { id: 2, cls: "entr", sub: 4 },
    // from bottom
    wipe: { id: 22, cls: "entr", sub: 1 },
    // from bottom
    wipeDown: { id: 22, cls: "entr", sub: 4 },
    // from top
    splitIn: { id: 16, cls: "entr", sub: 21 },
    // expand left/right from center
    bounce: { id: 26, cls: "entr", sub: 0 },
    flipIn: { id: 30, cls: "entr", sub: 0 },
    // flip in from far to near (Grow & Turn)
    zoom: { id: 23, cls: "entr", sub: 16 },
    pulse: { id: 26, cls: "emph", sub: 0 },
    spin: { id: 8, cls: "emph", sub: 0 },
    grow: { id: 6, cls: "emph", sub: 0 },
    teeter: { id: 32, cls: "emph", sub: 0 },
    disappear: { id: 1, cls: "exit", sub: 0 },
    fadeOut: { id: 10, cls: "exit", sub: 0 },
    flyOut: { id: 2, cls: "exit", sub: 4 },
    // to bottom
    wipeOut: { id: 22, cls: "exit", sub: 1 },
    shrink: { id: 30, cls: "exit", sub: 0 },
    // shrink and rotate (Shrink & Turn)
    zoomOut: { id: 23, cls: "exit", sub: 16 },
    motionPath: { id: 0, cls: "path", sub: 0 },
    // custom path
    mediaPause: { id: 1, cls: "mediacall", sub: 0 },
    mediaPlay: { id: 2, cls: "mediacall", sub: 0 },
    mediaStop: { id: 3, cls: "mediacall", sub: 0 }
  };
  var ANIM_EFFECTS = Object.keys(PRESET);

  // ../genoffice/packages/pptx-engine/src/blank.ts
  var import_jszip2 = __toESM(require_jszip_min(), 1);
  var XMLDECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
  var NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
  var NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  var NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main";
  var CONTENT_TYPES = XMLDECL + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>';
  var ROOT_RELS = XMLDECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>';
  var PRESENTATION = XMLDECL + `<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
  var PRESENTATION_RELS = XMLDECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>';
  var EMPTY_SPTREE = '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>';
  var BLANK_SLIDE_XML = XMLDECL + `<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld>${EMPTY_SPTREE}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  var SLIDE1_RELS = XMLDECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>';
  var LAYOUT1 = XMLDECL + `<p:sldLayout xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" type="blank"><p:cSld name="Blank">${EMPTY_SPTREE}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
  var LAYOUT1_RELS = XMLDECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>';
  var MASTER1 = XMLDECL + `<p:sldMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld>${EMPTY_SPTREE}</p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`;
  var MASTER1_RELS = XMLDECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>';
  var fillStyles = '<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>';
  var lnStyles = "<a:lnStyleLst>" + ["6350", "12700", "19050"].map((w) => `<a:ln w="${w}"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>`).join("") + "</a:lnStyleLst>";
  var effectStyles = "<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>";
  var bgFillStyles = '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>';
  var THEME1 = XMLDECL + `<a:theme xmlns:a="${NS_A}" name="Office"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="C43E1C"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="4472C4"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office">${fillStyles}${lnStyles}${effectStyles}${bgFillStyles}</a:fmtScheme></a:themeElements></a:theme>`;

  // ../genoffice/packages/pptx-engine/src/vendor/mtx/lzcomp.ts
  var PRELOAD_SIZE = 2 * 32 * 96 + 4 * 256;
  var LEN_WIDTH = 3;
  var BIT_RANGE = LEN_WIDTH - 1;

  // ../genoffice/packages/pptx-engine/src/table-edit.ts
  var inLn = (tag, color) => `<a:${tag}><a:ln w="9525" cap="flat"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:ln></a:${tag}>`;
  function partXml(tag, o) {
    const tx = o.text || o.bold ? `<a:tcTxStyle${o.bold ? ' b="on"' : ""}>${o.text ? `<a:srgbClr val="${o.text}"/>` : ""}</a:tcTxStyle>` : "";
    const bdr = o.insideH || o.insideV ? `<a:tcBdr>${o.insideH ? inLn("insideH", o.insideH) : ""}${o.insideV ? inLn("insideV", o.insideV) : ""}</a:tcBdr>` : "";
    const fill = o.fill ? `<a:fill><a:solidFill><a:srgbClr val="${o.fill}"/></a:solidFill></a:fill>` : "";
    const tc = bdr || fill ? `<a:tcStyle>${bdr}${fill}</a:tcStyle>` : "";
    return `<a:${tag}>${tx}${tc}</a:${tag}>`;
  }
  function customStyle(styleId, name, o) {
    return `<a:tblStyle styleId="${styleId}" styleName="${name}">` + partXml("wholeTbl", { text: "000000", fill: o.whole, insideH: o.insideH }) + (o.band ? partXml("band1H", { fill: o.band }) : "") + partXml("firstRow", {
      bold: true,
      ...o.header ? { fill: o.header.fill, text: o.header.text } : {}
    }) + "</a:tblStyle>";
  }
  var ID_ZEBRA_BLUE = "{A10FF1CE-0000-4000-9000-000000000001}";
  var ID_ZEBRA_GRAY = "{A10FF1CE-0000-4000-9000-000000000002}";
  var ID_HEADER_DARKBLUE = "{A10FF1CE-0000-4000-9000-000000000003}";
  var ID_HEADER_ORANGE = "{A10FF1CE-0000-4000-9000-000000000004}";
  var ID_NO_BORDER = "{A10FF1CE-0000-4000-9000-000000000005}";
  var tblPr = (styleId, flags = "") => `<a:tblPr${flags}><a:tableStyleId>${styleId}</a:tableStyleId></a:tblPr>`;
  var NO_STYLE = "{2D5ABB26-0587-4C30-8999-92F81FD0307C}";
  var TABLE_STYLE_PRESETS = {
    none: { tblPrXml: tblPr(NO_STYLE), description: "No style" },
    lightGrid: {
      tblPrXml: tblPr(NO_STYLE),
      description: "Light grid",
      border: { color: "#BFBFBF", widthEmu: 12700 }
    },
    zebraBlue: {
      tblPrXml: tblPr(ID_ZEBRA_BLUE, ' firstRow="1" bandRow="1"'),
      description: "Banded blue",
      styleId: ID_ZEBRA_BLUE,
      styleDefXml: customStyle(ID_ZEBRA_BLUE, "Banded blue", {
        whole: "FFFFFF",
        band: "D6E4F0",
        header: { fill: "4472C4", text: "FFFFFF" }
      })
    },
    zebraGray: {
      tblPrXml: tblPr(ID_ZEBRA_GRAY, ' firstRow="1" bandRow="1"'),
      description: "Banded gray",
      styleId: ID_ZEBRA_GRAY,
      styleDefXml: customStyle(ID_ZEBRA_GRAY, "Banded gray", {
        whole: "FFFFFF",
        band: "EDEDED",
        header: { fill: "595959", text: "FFFFFF" }
      })
    },
    headerDarkBlue: {
      tblPrXml: tblPr(ID_HEADER_DARKBLUE, ' firstRow="1"'),
      description: "Dark blue header",
      styleId: ID_HEADER_DARKBLUE,
      styleDefXml: customStyle(ID_HEADER_DARKBLUE, "Dark blue header", {
        whole: "FFFFFF",
        insideH: "D9D9D9",
        band: "E9EDF5",
        header: { fill: "1F3864", text: "FFFFFF" }
      })
    },
    headerOrange: {
      tblPrXml: tblPr(ID_HEADER_ORANGE, ' firstRow="1"'),
      description: "Orange header",
      styleId: ID_HEADER_ORANGE,
      styleDefXml: customStyle(ID_HEADER_ORANGE, "Orange header", {
        whole: "FFFFFF",
        insideH: "D9D9D9",
        band: "FBE5D6",
        header: { fill: "ED7D31", text: "FFFFFF" }
      })
    },
    noBorder: {
      tblPrXml: tblPr(ID_NO_BORDER, ' firstRow="1" bandRow="1"'),
      description: "Minimal (no borders)",
      styleId: ID_NO_BORDER,
      styleDefXml: customStyle(ID_NO_BORDER, "Minimal (no borders)", { band: "F2F2F2" })
    },
    fullBorder: {
      tblPrXml: tblPr(NO_STYLE),
      description: "All borders",
      border: { color: "#000000", widthEmu: 12700 }
    }
  };

  // ../genoffice/packages/pptx-engine/src/index.ts
  var import_jszip3 = __toESM(require_jszip_min(), 1);

  // ../genoffice/packages/pptx-engine/src/sections.ts
  init_node_shims();

  // ../genoffice/packages/pptx-engine/src/notes.ts
  var REL_BASE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  var NOTES_SLIDE_REL = `${REL_BASE}/notesSlide`;
  var NOTES_MASTER_REL = `${REL_BASE}/notesMaster`;
  var SLIDE_REL = `${REL_BASE}/slide`;
  var THEME_REL = `${REL_BASE}/theme`;

  // ../genoffice/packages/pptx-engine/src/background-promote.ts
  var EMU_PER_PX = 9525;
  var COVER_TOL = 2 * EMU_PER_PX;

  // ../genoffice/packages/pptx-engine/src/comments.ts
  var REL_BASE2 = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  var COMMENTS_REL = `${REL_BASE2}/comments`;
  var AUTHORS_REL = `${REL_BASE2}/commentAuthors`;

  // ../genoffice/packages/pptx-engine/src/media-insert.ts
  init_node_shims();
  var R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  var IMAGE_REL_TYPE = `${R_NS}/image`;
  var VIDEO_REL_TYPE = `${R_NS}/video`;
  var AUDIO_REL_TYPE = `${R_NS}/audio`;
  var CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
      t[n] = c;
    }
    return t;
  })();

  // ../../../tmp/genoffice/packages/pptx-engine/src/index.ts
  function parseSlideFromArchive(archive, slidePath) {
    const slideXml = archive.readText(slidePath);
    if (slideXml == null) return null;
    const chain = archive.resolveSlideChain(slidePath);
    const ctx = {};
    const layoutXml = (chain.layoutPath ? archive.readText(chain.layoutPath) : void 0) ?? void 0;
    const masterXml = (chain.masterPath ? archive.readText(chain.masterPath) : void 0) ?? void 0;
    if (chain.themePath) {
      const themeXml = archive.readText(chain.themePath);
      if (themeXml) {
        ctx.theme = parseTheme(themeXml);
        ctx.theme.clrMap = parseClrMap(masterXml, layoutXml, slideXml);
        ctx.themeMediaRels = partMediaRels(archive, chain.themePath);
      }
    }
    if (layoutXml) {
      if (chain.layoutPath) ctx.layoutMediaRels = partMediaRels(archive, chain.layoutPath);
      ctx.layoutPlaceholders = parsePlaceholderMap(layoutXml, ctx.theme, ctx.layoutMediaRels);
      ctx.layoutBg = layoutXml;
    }
    if (masterXml) {
      if (chain.masterPath) ctx.masterMediaRels = partMediaRels(archive, chain.masterPath);
      ctx.masterPlaceholders = parsePlaceholderMap(masterXml, ctx.theme, ctx.masterMediaRels);
      ctx.masterTextStyles = parseMasterTextStyles(masterXml, ctx.theme, ctx.masterMediaRels);
      ctx.masterBg = masterXml;
    }
    const presXml = archive.readText("ppt/presentation.xml");
    if (presXml) ctx.defaultTextStyle = parseDefaultTextStyle(presXml, ctx.theme);
    const rels = archive.readRels(slidePath);
    const mediaRels = /* @__PURE__ */ new Map();
    const chartXmls = /* @__PURE__ */ new Map();
    const chartMediaRels = /* @__PURE__ */ new Map();
    const chartUserShapes = /* @__PURE__ */ new Map();
    const chartStyleRels = /* @__PURE__ */ new Set();
    const chartThemeOverrides = /* @__PURE__ */ new Map();
    const avRels = /* @__PURE__ */ new Map();
    const diagramDrawings = /* @__PURE__ */ new Map();
    const diagramDatas = /* @__PURE__ */ new Map();
    const diagramMediaRels = /* @__PURE__ */ new Map();
    const diagramLayouts = /* @__PURE__ */ new Map();
    const diagramColors = /* @__PURE__ */ new Map();
    const vmlPreviews = /* @__PURE__ */ new Map();
    const hlinkRels = /* @__PURE__ */ new Map();
    let slideOrder;
    for (const rel of rels.values()) {
      if (rel.type.endsWith("/hyperlink")) {
        hlinkRels.set(rel.id, rel.target);
      } else if (rel.type.endsWith("/slide")) {
        slideOrder ??= archive.readPresentation().slidePaths;
        const idx = slideOrder.indexOf(resolveTarget(slidePath, rel.target));
        if (idx >= 0) hlinkRels.set(rel.id, `slide:${idx}`);
      } else if (rel.type.endsWith("/image")) {
        mediaRels.set(rel.id, resolveTarget(slidePath, rel.target));
      } else if (rel.type.endsWith("/chart") || rel.type.endsWith("/chartEx")) {
        const target = resolveTarget(slidePath, rel.target);
        const xml = archive.readText(target);
        if (xml) {
          chartXmls.set(rel.id, xml);
          chartMediaRels.set(rel.id, partMediaRels(archive, target));
          for (const sub of archive.readRels(target).values()) {
            if (sub.type.endsWith("/chartUserShapes")) {
              const usXml = archive.readText(resolveTarget(target, sub.target));
              if (usXml) chartUserShapes.set(rel.id, usXml);
            }
            if (sub.type.endsWith("/chartStyle")) chartStyleRels.add(rel.id);
            if (sub.type.endsWith("/themeOverride")) {
              const ovXml = archive.readText(resolveTarget(target, sub.target));
              if (ovXml) chartThemeOverrides.set(rel.id, ovXml);
            }
          }
        }
      } else if (/\/(?:video|audio|media)$/.test(rel.type)) {
        const external = rel.targetMode === "External";
        avRels.set(rel.id, {
          target: external ? rel.target : resolveTarget(slidePath, rel.target),
          ...external ? { external: true } : {}
        });
      } else if (rel.type.endsWith("/vmlDrawing")) {
        const vmlPath = resolveTarget(slidePath, rel.target);
        const vml = archive.readText(vmlPath);
        if (vml) {
          const vmlRels = archive.readRels(vmlPath);
          for (const m of vml.matchAll(/<v:shape\b([^>]*)>([\s\S]*?)<\/v:shape>/g)) {
            const relid = /<v:imagedata\b[^>]*\bo:relid="([^"]+)"/.exec(m[2])?.[1];
            const imgRel = relid ? vmlRels.get(relid) : void 0;
            if (!imgRel) continue;
            const target = resolveTarget(vmlPath, imgRel.target);
            for (const key of ["id", "o:spid"]) {
              const v = new RegExp(`\\b${key}="([^"]+)"`).exec(m[1])?.[1];
              if (v) vmlPreviews.set(v, target);
            }
          }
        }
      } else if (rel.type.endsWith("/diagramData")) {
        const dataPath = resolveTarget(slidePath, rel.target);
        const dataXml = archive.readText(dataPath);
        if (dataXml) diagramDatas.set(rel.id, dataXml);
        const relId = dataXml ? /<dsp:dataModelExt\b[^>]*\brelId="([^"]+)"/.exec(dataXml)?.[1] : void 0;
        if (relId) {
          const drawRel = rels.get(relId) ?? archive.readRels(dataPath).get(relId);
          const basePath = rels.get(relId) ? slidePath : dataPath;
          const drawingPath = drawRel ? resolveTarget(basePath, drawRel.target) : void 0;
          const drawingXml = drawingPath ? archive.readText(drawingPath) : void 0;
          if (drawingXml && drawingPath) {
            diagramDrawings.set(rel.id, drawingXml);
            diagramMediaRels.set(rel.id, partMediaRels(archive, drawingPath));
          }
        }
      } else if (rel.type.endsWith("/diagramLayout")) {
        const xml = archive.readText(resolveTarget(slidePath, rel.target));
        if (xml) diagramLayouts.set(rel.id, xml);
      } else if (rel.type.endsWith("/diagramColors")) {
        const xml = archive.readText(resolveTarget(slidePath, rel.target));
        if (xml) diagramColors.set(rel.id, xml);
      }
    }
    ctx.mediaRels = mediaRels;
    ctx.chartXmls = chartXmls;
    if (chartMediaRels.size) ctx.chartMediaRels = chartMediaRels;
    if (chartUserShapes.size) ctx.chartUserShapes = chartUserShapes;
    if (chartStyleRels.size) ctx.chartStyleRels = chartStyleRels;
    ctx.chartThemeOverrides = chartThemeOverrides;
    if (hlinkRels.size) ctx.hlinkRels = hlinkRels;
    if (avRels.size) ctx.avRels = avRels;
    if (diagramDrawings.size) ctx.diagramDrawings = diagramDrawings;
    if (diagramDatas.size) ctx.diagramDatas = diagramDatas;
    if (diagramMediaRels.size) ctx.diagramMediaRels = diagramMediaRels;
    if (diagramLayouts.size) ctx.diagramLayouts = diagramLayouts;
    if (diagramColors.size) ctx.diagramColors = diagramColors;
    if (vmlPreviews.size) ctx.vmlPreviews = vmlPreviews;
    ctx.tableStyles = archive.readText("ppt/tableStyles.xml") ?? void 0;
    const slide = parseSlide({
      path: slidePath,
      slideXml,
      layoutPath: chain.layoutPath,
      masterPath: chain.masterPath,
      ctx
    });
    const decorations = buildDecorations(archive, slidePath, slideXml, slide, layoutXml, masterXml, {
      layoutPath: chain.layoutPath,
      masterPath: chain.masterPath,
      theme: ctx.theme,
      masterPlaceholders: ctx.masterPlaceholders,
      masterTextStyles: ctx.masterTextStyles,
      defaultTextStyle: ctx.defaultTextStyle
    });
    if (decorations.length) slide.decorations = decorations;
    return slide;
  }
  function partMediaRels(archive, partPath) {
    const media = /* @__PURE__ */ new Map();
    for (const rel of archive.readRels(partPath).values()) {
      if (rel.type.endsWith("/image")) media.set(rel.id, resolveTarget(partPath, rel.target));
    }
    return media;
  }
  function hfState(xml, attr) {
    if (!xml) return "unset";
    const hf = /<p:hf\b[^>]*\/?>/.exec(xml)?.[0];
    if (!hf) return "unset";
    if (new RegExp(`\\b${attr}="(?:1|true)"`).test(hf)) return "on";
    if (new RegExp(`\\b${attr}="(?:0|false)"`).test(hf)) return "off";
    return "unset";
  }
  function buildDecorations(archive, slidePath, slideXml, slide, layoutXml, masterXml, parts) {
    const out = [];
    let slideNum;
    try {
      const idx = archive.readPresentation().slidePaths.indexOf(slidePath);
      if (idx >= 0) slideNum = idx + 1;
    } catch {
    }
    const HF_ALL = ["ftr", "sldNum", "dt"];
    const enabled = new Set(
      HF_ALL.filter((k) => {
        const l = hfState(layoutXml, k);
        const m = hfState(masterXml, k);
        if (l === "off" || m === "off") return false;
        return l === "on" || m === "on";
      })
    );
    const slidePh = new Set(
      slide.elements.map((e) => e.placeholder).filter(Boolean)
    );
    const hasPh = (xml, type) => !!xml && new RegExp(`<p:ph\\b[^>]*type="${type}"`).test(xml);
    const slideHidesInherited = /<p:sld\b[^>]*showMasterSp=(?:"(?:0|false)"|'(?:0|false)')/.test(
      slideXml
    );
    const masterShown = !slideHidesInherited && !(layoutXml && /<p:sldLayout\b[^>]*showMasterSp=(?:"(?:0|false)"|'(?:0|false)')/.test(layoutXml));
    if (masterXml && parts.masterPath) {
      const hfTypes = new Set([...enabled].filter((k) => !slidePh.has(k) && !hasPh(layoutXml, k)));
      if (masterShown || hfTypes.size) {
        const ctx = {
          theme: parts.theme,
          mediaRels: partMediaRels(archive, parts.masterPath),
          defaultTextStyle: parts.defaultTextStyle
        };
        out.push(
          ...parseDecorations(masterXml, ctx, {
            hfTypes,
            hideShapes: !masterShown,
            ...slideNum != null ? { slideNum } : {}
          })
        );
      }
    }
    if (layoutXml && parts.layoutPath) {
      const hfTypes = new Set([...enabled].filter((k) => !slidePh.has(k)));
      if (!slideHidesInherited || hfTypes.size) {
        const ctx = {
          theme: parts.theme,
          mediaRels: partMediaRels(archive, parts.layoutPath),
          masterPlaceholders: parts.masterPlaceholders,
          masterTextStyles: parts.masterTextStyles,
          defaultTextStyle: parts.defaultTextStyle
        };
        out.push(
          ...parseDecorations(layoutXml, ctx, {
            hfTypes,
            hideShapes: slideHidesInherited,
            ...slideNum != null ? { slideNum } : {}
          })
        );
      }
    }
    return out;
  }
  async function openPptx(bytes) {
    const archive = await PackageArchive.open(bytes);
    const { size, slidePaths } = archive.readPresentation();
    const slides = [];
    for (const slidePath of slidePaths) {
      const slide = parseSlideFromArchive(archive, slidePath);
      if (slide) slides.push(slide);
    }
    const deck = { slides, size, originalHash: archive.originalHash };
    return { deck, archive };
  }

  // ../genoffice/packages/pptx-render/src/coords.ts
  var EMU_PER_PX_96 = 9525;
  var EMU_PER_PT2 = 12700;
  function emuToPx(emu, scale2 = 1) {
    if (!Number.isFinite(emu) || !Number.isFinite(scale2)) return 0;
    return emu / EMU_PER_PX_96 * scale2;
  }
  function ptToPx(pt, scale2 = 1) {
    if (!Number.isFinite(pt) || !Number.isFinite(scale2)) return 0;
    return pt * 96 / 72 * scale2;
  }
  function rotToDeg(rot) {
    if (!Number.isFinite(rot)) return 0;
    return rot / 6e4;
  }
  function makeViewport(size, fitWidthPx) {
    const DEFAULT_CX_EMU = 9144e3;
    const DEFAULT_CY_EMU = 6858e3;
    const isPositiveFinite = (v) => Number.isFinite(v) && v > 0;
    const safeCx = isPositiveFinite(size.cx) ? size.cx : DEFAULT_CX_EMU;
    const safeCy = isPositiveFinite(size.cy) ? size.cy : DEFAULT_CY_EMU;
    const safeFitWidthPx = isPositiveFinite(fitWidthPx) ? fitWidthPx : safeCx / EMU_PER_PX_96;
    const baseWidthPx = safeCx / EMU_PER_PX_96;
    const scale2 = safeFitWidthPx / baseWidthPx;
    return {
      widthPx: safeFitWidthPx,
      heightPx: safeCy / EMU_PER_PX_96 * scale2,
      scale: scale2
    };
  }
  function rectToPx(r, vp) {
    return {
      x: emuToPx(r.x, vp.scale),
      y: emuToPx(r.y, vp.scale),
      w: emuToPx(r.cx, vp.scale),
      h: emuToPx(r.cy, vp.scale)
    };
  }
  function placeTransform(t, vp, parent = { x: 0, y: 0 }) {
    const r = rectToPx(t.offset, vp);
    const sx = parent.scaleX ?? 1;
    const sy = parent.scaleY ?? 1;
    const deg = (rotToDeg(t.rot) % 180 + 180) % 180;
    const quarter = sx !== sy && Math.abs(deg - 90) < 0.5;
    const w = r.w * (quarter ? sy : sx);
    const h = r.h * (quarter ? sx : sy);
    const x = (r.x + r.w / 2) * sx + parent.x - w / 2;
    const y = (r.y + r.h / 2) * sy + parent.y - h / 2;
    return {
      x,
      y,
      w,
      h,
      rotationDeg: rotToDeg(t.rot),
      flipH: t.flipH,
      flipV: t.flipV,
      centerX: x + w / 2,
      centerY: y + h / 2
    };
  }

  // ../genoffice/packages/pptx-render/src/image-dpi.ts
  var Buffer4 = Buffer2;
  var HEAD_B64_CHARS = 96 * 1024;
  var cache = /* @__PURE__ */ new Map();
  var IMAGE_DPI_CACHE_MAX = 256;
  function cacheKeyFor(dataUrl) {
    const comma = dataUrl.indexOf(",");
    const end = Math.min(dataUrl.length, (comma < 0 ? 0 : comma + 1) + HEAD_B64_CHARS);
    let hash = 2166136261;
    for (let i = 0; i < end; i++) {
      hash ^= dataUrl.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `${dataUrl.length}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }
  function imageDpiFromDataUrl(dataUrl) {
    if (!dataUrl) return void 0;
    const key = cacheKeyFor(dataUrl);
    if (cache.has(key)) {
      const cached = cache.get(key);
      cache.delete(key);
      cache.set(key, cached);
      return cached;
    }
    const dpi = imageDpiFromBytes(decodeHead(dataUrl));
    if (cache.size >= IMAGE_DPI_CACHE_MAX) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
    cache.set(key, dpi);
    return dpi;
  }
  function decodeHead(dataUrl) {
    const comma = dataUrl.indexOf(",");
    if (comma < 0 || !/;base64/i.test(dataUrl.slice(0, comma))) return new Uint8Array(0);
    const b64 = dataUrl.slice(comma + 1, comma + 1 + HEAD_B64_CHARS);
    const whole = Math.floor(b64.length / 4) * 4;
    const chunk = b64.length < HEAD_B64_CHARS ? b64 : b64.slice(0, whole);
    try {
      if (typeof Buffer4 !== "undefined") return new Uint8Array(Buffer4.from(chunk, "base64"));
      const s = atob(chunk);
      const out = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
      return out;
    } catch {
      return new Uint8Array(0);
    }
  }
  function imageDpiFromBytes(b) {
    if (b.length < 16) return void 0;
    if (b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71) return pngDpi(b);
    if (b[0] === 255 && b[1] === 216) return jpegDpi(b);
    return void 0;
  }
  function plausible(x, y) {
    return x >= 10 && x <= 1e4 && y >= 10 && y <= 1e4 ? { x, y } : void 0;
  }
  function u32(b, o) {
    return (b[o] << 24 >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
  }
  function pngDpi(b) {
    let o = 8;
    while (o + 12 <= b.length) {
      const len = u32(b, o);
      const type = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
      if (type === "IDAT" || type === "IEND") return void 0;
      if (type === "pHYs" && len >= 9 && o + 8 + 9 <= b.length) {
        if (b[o + 16] !== 1) return void 0;
        return plausible(u32(b, o + 8) * 0.0254, u32(b, o + 12) * 0.0254);
      }
      o += 12 + len;
    }
    return void 0;
  }
  function jpegDpi(b) {
    let exif;
    let o = 2;
    while (o + 4 <= b.length && b[o] === 255) {
      const marker = b[o + 1];
      if (marker === 216 || marker >= 208 && marker <= 215 || marker === 1) {
        o += 2;
        continue;
      }
      const len = (b[o + 2] << 8) + b[o + 3];
      if (marker === 218 || marker === 217) return exif;
      if (marker === 224 && len >= 16 && o + 2 + len <= b.length) {
        const p = o + 4;
        const isJfif = b[p] === 74 && b[p + 1] === 70 && b[p + 2] === 73 && b[p + 3] === 70 && b[p + 4] === 0;
        if (isJfif) {
          const units = b[p + 7];
          const xd = (b[p + 8] << 8) + b[p + 9];
          const yd = (b[p + 10] << 8) + b[p + 11];
          if (units === 1) return plausible(xd, yd);
          if (units === 2) return plausible(xd * 2.54, yd * 2.54);
        }
      }
      if (marker === 225 && !exif && o + 2 + len <= b.length) exif = exifDpi(b, o + 4, o + 2 + len);
      o += 2 + len;
    }
    return exif;
  }
  var EXIF_X_RESOLUTION = 282;
  var EXIF_Y_RESOLUTION = 283;
  var EXIF_RESOLUTION_UNIT = 296;
  function exifDpi(b, p, end) {
    const isExif = b[p] === 69 && b[p + 1] === 120 && b[p + 2] === 105 && b[p + 3] === 102 && b[p + 4] === 0 && b[p + 5] === 0;
    if (!isExif) return void 0;
    const tiff = p + 6;
    const le = b[tiff] === 73 && b[tiff + 1] === 73;
    if (!le && !(b[tiff] === 77 && b[tiff + 1] === 77)) return void 0;
    const u16 = (o) => le ? b[o] | b[o + 1] << 8 : b[o] << 8 | b[o + 1];
    const rd32 = (o) => le ? (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0 : u32(b, o);
    const rational = (e) => {
      const at = tiff + rd32(e + 8);
      if (at + 8 > end) return void 0;
      const den = rd32(at + 4);
      return den ? rd32(at) / den : void 0;
    };
    if (tiff + 8 > end) return void 0;
    const ifd0 = tiff + rd32(tiff + 4);
    if (ifd0 + 2 > end) return void 0;
    const count = u16(ifd0);
    let x;
    let y;
    let unit = 2;
    for (let i = 0; i < count; i++) {
      const e = ifd0 + 2 + i * 12;
      if (e + 12 > end) return void 0;
      const tag = u16(e);
      if (tag === EXIF_X_RESOLUTION) x = rational(e);
      else if (tag === EXIF_Y_RESOLUTION) y = rational(e);
      else if (tag === EXIF_RESOLUTION_UNIT) unit = u16(e + 8);
    }
    if (x == null || y == null) return void 0;
    if (unit === 3) return plausible(x * 2.54, y * 2.54);
    return unit === 2 ? plausible(x, y) : void 0;
  }

  // ../genoffice/packages/pptx-render/src/fill.ts
  function resolveFill(fill, vp, media, tileFrame) {
    if (!fill) return { kind: "none" };
    switch (fill.type) {
      case "none":
        return { kind: "none" };
      case "solid":
        return { kind: "solid", color: fill.color };
      case "gradient":
        return {
          kind: "gradient",
          stops: fill.stops.map((s) => ({ pos: s.pos, color: s.color })),
          angleDeg: fill.angle != null ? fill.angle / 6e4 : 0,
          ...fill.scaled ? { scaled: true } : {},
          ...fill.path ? { radial: true, path: fill.path } : {},
          ...fill.path && fill.fillTo ? {
            center: {
              x: (fill.fillTo.l + (1 - fill.fillTo.r)) / 2,
              y: (fill.fillTo.t + (1 - fill.fillTo.b)) / 2
            }
          } : {},
          ...fill.path && fill.tileRect ? { tileRect: fill.tileRect } : {}
        };
      case "image": {
        const dataUrl = media?.(fill.mediaRef);
        const dpi = fill.tile ? imageDpiFromDataUrl(dataUrl) : void 0;
        const pxPerImagePxX = vp.scale * (96 / (dpi?.x ?? 144));
        const pxPerImagePxY = vp.scale * (96 / (dpi?.y ?? 144));
        return {
          kind: "image",
          dataUrl,
          mode: fill.mode ?? "stretch",
          ...fill.alpha != null ? { alpha: fill.alpha } : {},
          ...fill.fillRect ? { fillRect: fill.fillRect } : {},
          ...fill.duotone ? { duotone: fill.duotone } : {},
          ...fill.lum ? { lum: fill.lum } : {},
          ...fill.clrChange ? { clrChange: fill.clrChange } : {},
          ...fill.biLevel != null ? { biLevel: fill.biLevel } : {},
          ...fill.tile ? {
            tile: {
              scaleX: pxPerImagePxX * fill.tile.sx,
              scaleY: pxPerImagePxY * fill.tile.sy,
              txPx: emuToPx(fill.tile.tx, vp.scale),
              tyPx: emuToPx(fill.tile.ty, vp.scale),
              algn: fill.tile.algn,
              ...tileFrame ? { frame: tileFrame } : {}
            }
          } : {}
        };
      }
      case "pattern":
        return {
          kind: "pattern",
          preset: fill.preset,
          fg: fill.fg,
          bg: fill.bg,
          cellPx: 8 * vp.scale
        };
      default:
        return { kind: "none" };
    }
  }
  function resolveStroke(stroke, vp) {
    if (!stroke) return void 0;
    const rf = stroke.fill;
    let color = "#000000";
    let gradient;
    if (rf.type === "solid") color = rf.color;
    else if (rf.type === "gradient" && rf.stops.length) {
      gradient = {
        stops: rf.stops.map((s) => ({ pos: s.pos, color: s.color })),
        angleDeg: rf.angle != null ? rf.angle / 6e4 : 0,
        ...rf.scaled ? { scaled: true } : {}
      };
      color = rf.stops[0].color;
    } else if (rf.type === "none") return void 0;
    const widthPx = Math.max(emuToPx(stroke.width || 12700, vp.scale), 0.5);
    const widthPt = (stroke.width || 12700) / EMU_PER_PT2;
    const dash = dashPreset(stroke.dash, widthPx);
    const capMap = { flat: "butt", round: "round", square: "square" };
    return {
      color,
      widthPx,
      widthPt,
      ...dash ? { dash } : {},
      ...stroke.dash && stroke.dash !== "solid" ? { dashPreset: stroke.dash } : {},
      ...stroke.cap ? { cap: capMap[stroke.cap] } : {},
      ...stroke.join ? { join: stroke.join } : {},
      ...stroke.compound ? { compound: stroke.compound } : {},
      ...gradient ? { gradient } : {}
    };
  }
  function resolveGlow(glow, vp) {
    if (!glow) return void 0;
    return { color: glow.color, blurPx: emuToPx(glow.radius, vp.scale) };
  }
  function resolveReflection(reflection, vp) {
    if (!reflection) return void 0;
    return {
      blurPx: emuToPx(reflection.blurRad, vp.scale),
      startAlpha: reflection.startA,
      endPos: reflection.endPos,
      distPx: emuToPx(reflection.dist, vp.scale)
    };
  }
  function resolveShadow(shadow, vp) {
    if (!shadow) return void 0;
    const distPx = emuToPx(shadow.dist, vp.scale);
    const rad2 = shadow.dirDeg * Math.PI / 180;
    return {
      color: shadow.color,
      blurPx: emuToPx(shadow.blurRad, vp.scale),
      offsetX: Math.cos(rad2) * distPx,
      offsetY: Math.sin(rad2) * distPx,
      distPx,
      dirDeg: shadow.dirDeg,
      ...shadow.inner ? { inner: true } : {},
      ...shadow.sx != null ? { scaleX: shadow.sx } : {},
      ...shadow.sy != null ? { scaleY: shadow.sy } : {},
      ...shadow.kxDeg ? { skewXDeg: shadow.kxDeg } : {},
      ...shadow.kyDeg ? { skewYDeg: shadow.kyDeg } : {},
      ...shadow.algn ? { algn: shadow.algn } : {}
    };
  }
  function dashPreset(name, w) {
    if (!name || name === "solid") return void 0;
    const u = w;
    switch (name) {
      case "dot":
      case "sysDot":
        return [u, u];
      case "dash":
      case "sysDash":
        return [4 * u, 3 * u];
      case "lgDash":
        return [8 * u, 3 * u];
      case "dashDot":
      case "sysDashDot":
        return [4 * u, 3 * u, u, 3 * u];
      case "lgDashDot":
        return [8 * u, 3 * u, u, 3 * u];
      case "lgDashDotDot":
        return [8 * u, 3 * u, u, 3 * u, u, 3 * u];
      case "dashDotDot":
      case "sysDashDotDot":
        return [4 * u, 3 * u, u, 3 * u, u, 3 * u];
      default:
        return void 0;
    }
  }

  // ../genoffice/packages/pptx-render/src/metrics.ts
  var SEGMENTER = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(void 0, { granularity: "grapheme" }) : null;
  function graphemes(text) {
    if (!SEGMENTER) return [...text];
    const out = [];
    for (const s of SEGMENTER.segment(text)) out.push(s.segment);
    return out;
  }
  var WIDE_RANGES = [
    [4352, 4447],
    // Hangul Jamo (initial consonants)
    [11904, 12350],
    // CJK radicals / Kangxi radicals / CJK punctuation
    [12353, 13311],
    // Kana / Bopomofo / compatibility Hangul Jamo / CJK compatibility
    [13312, 19903],
    // CJK Extension A
    [19968, 40959],
    // CJK basic
    [40960, 42191],
    // Yi
    [43360, 43391],
    // Hangul Jamo Extended-A
    [44032, 55203],
    // Hangul syllables
    [63744, 64255],
    // compatibility ideographs
    [65072, 65103],
    // CJK compatibility forms
    [65280, 65376],
    // fullwidth ASCII
    [65504, 65510],
    // fullwidth symbols
    [110592, 111359],
    // Kana extensions
    [131072, 262141]
    // CJK Extension B+
  ];
  function isWideChar(code) {
    for (const [lo, hi] of WIDE_RANGES) {
      if (code >= lo && code <= hi) return true;
    }
    return false;
  }
  function charAdvanceEm(code) {
    if (isWideChar(code)) return 1;
    if (code >= 126976 || code >= 9728 && code <= 10175) return 1;
    if (code >= 9632 && code <= 9727 || code === 8251) return 1;
    if (code >= 9312 && code <= 9471) return 1;
    if ("iIlj.,:;'!|".includes(String.fromCharCode(code))) return 0.28;
    if (" ftr".includes(String.fromCharCode(code))) return 0.32;
    if ("mwMW".includes(String.fromCharCode(code))) return 0.82;
    return 0.52;
  }
  var ZERO_WIDTH_RE = /[\p{Mn}\p{Me}\p{Cf}]/u;
  var EMOJI_JOIN_RE = /[\u200d\ufe0f\u{1f1e6}-\u{1f1ff}\u{1f3fb}-\u{1f3ff}]/u;
  function clusterAdvanceEm(g) {
    if (g.length > 1 && EMOJI_JOIN_RE.test(g)) return 1;
    let em = 0;
    for (const ch of g) {
      em += ZERO_WIDTH_RE.test(ch) ? 0 : charAdvanceEm(ch.codePointAt(0) ?? 0);
    }
    return em;
  }
  var HeuristicMetrics = class {
    metrics(style) {
      const s = style.fontSizePx;
      return {
        ascent: s * 0.8,
        descent: s * 0.2,
        lineHeight: s * 1.2
      };
    }
    measure(text, style) {
      let em = 0;
      for (const g of graphemes(text)) {
        em += clusterAdvanceEm(g);
      }
      const boldFactor = style.bold ? 1.04 : 1;
      return em * style.fontSizePx * boldFactor;
    }
  };

  // node_modules/bidi-js/dist/bidi.mjs
  function bidiFactory() {
    var bidi = function(exports2) {
      var DATA = {
        "R": "13k,1a,2,3,3,2+1j,ch+16,a+1,5+2,2+n,5,a,4,6+16,4+3,h+1b,4mo,179q,2+9,2+11,2i9+7y,2+68,4,3+4,5+13,4+3,2+4k,3+29,8+cf,1t+7z,w+17,3+3m,1t+3z,16o1+5r,8+30,8+mc,29+1r,29+4v,75+73",
        "EN": "1c+9,3d+1,6,187+9,513,4+5,7+9,sf+j,175h+9,qw+q,161f+1d,4xt+a,25i+9",
        "ES": "17,2,6dp+1,f+1,av,16vr,mx+1,4o,2",
        "ET": "z+2,3h+3,b+1,ym,3e+1,2o,p4+1,8,6u,7c,g6,1wc,1n9+4,30+1b,2n,6d,qhx+1,h0m,a+1,49+2,63+1,4+1,6bb+3,12jj",
        "AN": "16o+5,2j+9,2+1,35,ed,1ff2+9,87+u",
        "CS": "18,2+1,b,2u,12k,55v,l,17v0,2,3,53,2+1,b",
        "B": "a,3,f+2,2v,690",
        "S": "9,2,k",
        "WS": "c,k,4f4,1vk+a,u,1j,335",
        "ON": "x+1,4+4,h+5,r+5,r+3,z,5+3,2+1,2+1,5,2+2,3+4,o,w,ci+1,8+d,3+d,6+8,2+g,39+1,9,6+1,2,33,b8,3+1,3c+1,7+1,5r,b,7h+3,sa+5,2,3i+6,jg+3,ur+9,2v,ij+1,9g+9,7+a,8m,4+1,49+x,14u,2+2,c+2,e+2,e+2,e+1,i+n,e+e,2+p,u+2,e+2,36+1,2+3,2+1,b,2+2,6+5,2,2,2,h+1,5+4,6+3,3+f,16+2,5+3l,3+81,1y+p,2+40,q+a,m+13,2r+ch,2+9e,75+hf,3+v,2+2w,6e+5,f+6,75+2a,1a+p,2+2g,d+5x,r+b,6+3,4+o,g,6+1,6+2,2k+1,4,2j,5h+z,1m+1,1e+f,t+2,1f+e,d+3,4o+3,2s+1,w,535+1r,h3l+1i,93+2,2s,b+1,3l+x,2v,4g+3,21+3,kz+1,g5v+1,5a,j+9,n+v,2,3,2+8,2+1,3+2,2,3,46+1,4+4,h+5,r+5,r+a,3h+2,4+6,b+4,78,1r+24,4+c,4,1hb,ey+6,103+j,16j+c,1ux+7,5+g,fsh,jdq+1t,4,57+2e,p1,1m,1m,1m,1m,4kt+1,7j+17,5+2r,d+e,3+e,2+e,2+10,m+4,w,1n+5,1q,4z+5,4b+rb,9+c,4+c,4+37,d+2g,8+b,l+b,5+1j,9+9,7+13,9+t,3+1,27+3c,2+29,2+3q,d+d,3+4,4+2,6+6,a+o,8+6,a+2,e+6,16+42,2+1i",
        "BN": "0+8,6+d,2s+5,2+p,e,4m9,1kt+2,2b+5,5+5,17q9+v,7k,6p+8,6+1,119d+3,440+7,96s+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+75,6p+2rz,1ben+1,1ekf+1,1ekf+1",
        "NSM": "lc+33,7o+6,7c+18,2,2+1,2+1,2,21+a,1d+k,h,2u+6,3+5,3+1,2+3,10,v+q,2k+a,1n+8,a,p+3,2+8,2+2,2+4,18+2,3c+e,2+v,1k,2,5+7,5,4+6,b+1,u,1n,5+3,9,l+1,r,3+1,1m,5+1,5+1,3+2,4,v+1,4,c+1,1m,5+4,2+1,5,l+1,n+5,2,1n,3,2+3,9,8+1,c+1,v,1q,d,1f,4,1m+2,6+2,2+3,8+1,c+1,u,1n,g+1,l+1,t+1,1m+1,5+3,9,l+1,u,21,8+2,2,2j,3+6,d+7,2r,3+8,c+5,23+1,s,2,2,1k+d,2+4,2+1,6+a,2+z,a,2v+3,2+5,2+1,3+1,q+1,5+2,h+3,e,3+1,7,g,jk+2,qb+2,u+2,u+1,v+1,1t+1,2+6,9,3+a,a,1a+2,3c+1,z,3b+2,5+1,a,7+2,64+1,3,1n,2+6,2,2,3+7,7+9,3,1d+g,1s+3,1d,2+4,2,6,15+8,d+1,x+3,3+1,2+2,1l,2+1,4,2+2,1n+7,3+1,49+2,2+c,2+6,5,7,4+1,5j+1l,2+4,k1+w,2db+2,3y,2p+v,ff+3,30+1,n9x+3,2+9,x+1,29+1,7l,4,5,q+1,6,48+1,r+h,e,13+7,q+a,1b+2,1d,3+3,3+1,14,1w+5,3+1,3+1,d,9,1c,1g,2+2,3+1,6+1,2,17+1,9,6n,3,5,fn5,ki+f,h+f,r2,6b,46+4,1af+2,2+1,6+3,15+2,5,4m+1,fy+3,as+1,4a+a,4x,1j+e,1l+2,1e+3,3+1,1y+2,11+4,2+7,1r,d+1,1h+8,b+3,3,2o+2,3,2+1,7,4h,4+7,m+1,1m+1,4,12+6,4+4,5g+7,3+2,2,o,2d+5,2,5+1,2+1,6n+3,7+1,2+1,s+1,2e+7,3,2+1,2z,2,3+5,2,2u+2,3+3,2+4,78+8,2+1,75+1,2,5,41+3,3+1,5,x+5,3+1,15+5,3+3,9,a+5,3+2,1b+c,2+1,bb+6,2+5,2d+l,3+6,2+1,2+1,3f+5,4,2+1,2+6,2,21+1,4,2,9o+1,f0c+4,1o+6,t5,1s+3,2a,f5l+1,43t+2,i+7,3+6,v+3,45+2,1j0+1i,5+1d,9,f,n+4,2+e,11t+6,2+g,3+6,2+1,2+4,7a+6,c6+3,15t+6,32+6,gzhy+6n",
        "AL": "16w,3,2,e+1b,z+2,2+2s,g+1,8+1,b+m,2+t,s+2i,c+e,4h+f,1d+1e,1bwe+dp,3+3z,x+c,2+1,35+3y,2rm+z,5+7,b+5,dt+l,c+u,17nl+27,1t+27,4x+6n,3+d",
        "LRO": "6ct",
        "RLO": "6cu",
        "LRE": "6cq",
        "RLE": "6cr",
        "PDF": "6cs",
        "LRI": "6ee",
        "RLI": "6ef",
        "FSI": "6eg",
        "PDI": "6eh"
      };
      var TYPES = {};
      var TYPES_TO_NAMES = {};
      TYPES.L = 1;
      TYPES_TO_NAMES[1] = "L";
      Object.keys(DATA).forEach(function(type, i) {
        TYPES[type] = 1 << i + 1;
        TYPES_TO_NAMES[TYPES[type]] = type;
      });
      Object.freeze(TYPES);
      var ISOLATE_INIT_TYPES = TYPES.LRI | TYPES.RLI | TYPES.FSI;
      var STRONG_TYPES = TYPES.L | TYPES.R | TYPES.AL;
      var NEUTRAL_ISOLATE_TYPES = TYPES.B | TYPES.S | TYPES.WS | TYPES.ON | TYPES.FSI | TYPES.LRI | TYPES.RLI | TYPES.PDI;
      var BN_LIKE_TYPES = TYPES.BN | TYPES.RLE | TYPES.LRE | TYPES.RLO | TYPES.LRO | TYPES.PDF;
      var TRAILING_TYPES = TYPES.S | TYPES.WS | TYPES.B | ISOLATE_INIT_TYPES | TYPES.PDI | BN_LIKE_TYPES;
      var map = null;
      function parseData() {
        if (!map) {
          map = /* @__PURE__ */ new Map();
          var start = 0;
          for (var type in DATA) {
            if (DATA.hasOwnProperty(type)) {
              var segments = DATA[type];
              var temp = "";
              var end = void 0;
              var state = false;
              var lastCode = 0;
              for (var i = 0; i <= segments.length + 1; i += 1) {
                var char = segments[i];
                if (char !== "," && i !== segments.length) {
                  if (char === "+") {
                    state = true;
                    lastCode = start = lastCode + parseInt(temp, 36);
                    temp = "";
                  } else {
                    temp += char;
                  }
                } else {
                  if (!state) {
                    lastCode = start = lastCode + parseInt(temp, 36);
                    end = start;
                  } else {
                    end = start + parseInt(temp, 36);
                  }
                  state = false;
                  temp = "";
                  lastCode = end;
                  for (var j = start; j < end + 1; j += 1) {
                    map.set(j, TYPES[type]);
                  }
                }
              }
            }
          }
        }
      }
      function getBidiCharType(char) {
        parseData();
        return map.get(char.codePointAt(0)) || TYPES.L;
      }
      function getBidiCharTypeName(char) {
        return TYPES_TO_NAMES[getBidiCharType(char)];
      }
      var data$1 = {
        "pairs": "14>1,1e>2,u>2,2wt>1,1>1,1ge>1,1wp>1,1j>1,f>1,hm>1,1>1,u>1,u6>1,1>1,+5,28>1,w>1,1>1,+3,b8>1,1>1,+3,1>3,-1>-1,3>1,1>1,+2,1s>1,1>1,x>1,th>1,1>1,+2,db>1,1>1,+3,3>1,1>1,+2,14qm>1,1>1,+1,4q>1,1e>2,u>2,2>1,+1",
        "canonical": "6f1>-6dx,6dy>-6dx,6ec>-6ed,6ee>-6ed,6ww>2jj,-2ji>2jj,14r4>-1e7l,1e7m>-1e7l,1e7m>-1e5c,1e5d>-1e5b,1e5c>-14qx,14qy>-14qx,14vn>-1ecg,1ech>-1ecg,1edu>-1ecg,1eci>-1ecg,1eda>-1ecg,1eci>-1ecg,1eci>-168q,168r>-168q,168s>-14ye,14yf>-14ye"
      };
      function parseCharacterMap(encodedString, includeReverse) {
        var radix = 36;
        var lastCode = 0;
        var map2 = /* @__PURE__ */ new Map();
        var reverseMap = includeReverse && /* @__PURE__ */ new Map();
        var prevPair;
        encodedString.split(",").forEach(function visit(entry) {
          if (entry.indexOf("+") !== -1) {
            for (var i = +entry; i--; ) {
              visit(prevPair);
            }
          } else {
            prevPair = entry;
            var ref = entry.split(">");
            var a = ref[0];
            var b = ref[1];
            a = String.fromCodePoint(lastCode += parseInt(a, radix));
            b = String.fromCodePoint(lastCode += parseInt(b, radix));
            map2.set(a, b);
            includeReverse && reverseMap.set(b, a);
          }
        });
        return { map: map2, reverseMap };
      }
      var openToClose, closeToOpen, canonical;
      function parse$1() {
        if (!openToClose) {
          var ref = parseCharacterMap(data$1.pairs, true);
          var map2 = ref.map;
          var reverseMap = ref.reverseMap;
          openToClose = map2;
          closeToOpen = reverseMap;
          canonical = parseCharacterMap(data$1.canonical, false).map;
        }
      }
      function openingToClosingBracket(char) {
        parse$1();
        return openToClose.get(char) || null;
      }
      function closingToOpeningBracket(char) {
        parse$1();
        return closeToOpen.get(char) || null;
      }
      function getCanonicalBracket(char) {
        parse$1();
        return canonical.get(char) || null;
      }
      var TYPE_L = TYPES.L;
      var TYPE_R = TYPES.R;
      var TYPE_EN = TYPES.EN;
      var TYPE_ES = TYPES.ES;
      var TYPE_ET = TYPES.ET;
      var TYPE_AN = TYPES.AN;
      var TYPE_CS = TYPES.CS;
      var TYPE_B = TYPES.B;
      var TYPE_S = TYPES.S;
      var TYPE_ON = TYPES.ON;
      var TYPE_BN = TYPES.BN;
      var TYPE_NSM = TYPES.NSM;
      var TYPE_AL = TYPES.AL;
      var TYPE_LRO = TYPES.LRO;
      var TYPE_RLO = TYPES.RLO;
      var TYPE_LRE = TYPES.LRE;
      var TYPE_RLE = TYPES.RLE;
      var TYPE_PDF = TYPES.PDF;
      var TYPE_LRI = TYPES.LRI;
      var TYPE_RLI = TYPES.RLI;
      var TYPE_FSI = TYPES.FSI;
      var TYPE_PDI = TYPES.PDI;
      function getEmbeddingLevels(string, baseDirection) {
        var MAX_DEPTH = 125;
        var charTypes = new Uint32Array(string.length);
        for (var i = 0; i < string.length; i++) {
          charTypes[i] = getBidiCharType(string[i]);
        }
        var charTypeCounts = /* @__PURE__ */ new Map();
        function changeCharType(i2, type2) {
          var oldType = charTypes[i2];
          charTypes[i2] = type2;
          charTypeCounts.set(oldType, charTypeCounts.get(oldType) - 1);
          if (oldType & NEUTRAL_ISOLATE_TYPES) {
            charTypeCounts.set(NEUTRAL_ISOLATE_TYPES, charTypeCounts.get(NEUTRAL_ISOLATE_TYPES) - 1);
          }
          charTypeCounts.set(type2, (charTypeCounts.get(type2) || 0) + 1);
          if (type2 & NEUTRAL_ISOLATE_TYPES) {
            charTypeCounts.set(NEUTRAL_ISOLATE_TYPES, (charTypeCounts.get(NEUTRAL_ISOLATE_TYPES) || 0) + 1);
          }
        }
        var embedLevels = new Uint8Array(string.length);
        var isolationPairs = /* @__PURE__ */ new Map();
        var paragraphs = [];
        var paragraph = null;
        for (var i$1 = 0; i$1 < string.length; i$1++) {
          if (!paragraph) {
            paragraphs.push(paragraph = {
              start: i$1,
              end: string.length - 1,
              // 3.3.1 P2-P3: Determine the paragraph level
              level: baseDirection === "rtl" ? 1 : baseDirection === "ltr" ? 0 : determineAutoEmbedLevel(i$1, false)
            });
          }
          if (charTypes[i$1] & TYPE_B) {
            paragraph.end = i$1;
            paragraph = null;
          }
        }
        var FORMATTING_TYPES = TYPE_RLE | TYPE_LRE | TYPE_RLO | TYPE_LRO | ISOLATE_INIT_TYPES | TYPE_PDI | TYPE_PDF | TYPE_B;
        var nextEven = function(n) {
          return n + (n & 1 ? 1 : 2);
        };
        var nextOdd = function(n) {
          return n + (n & 1 ? 2 : 1);
        };
        for (var paraIdx = 0; paraIdx < paragraphs.length; paraIdx++) {
          paragraph = paragraphs[paraIdx];
          var statusStack = [{
            _level: paragraph.level,
            _override: 0,
            //0=neutral, 1=L, 2=R
            _isolate: 0
            //bool
          }];
          var stackTop = void 0;
          var overflowIsolateCount = 0;
          var overflowEmbeddingCount = 0;
          var validIsolateCount = 0;
          charTypeCounts.clear();
          for (var i$2 = paragraph.start; i$2 <= paragraph.end; i$2++) {
            var charType = charTypes[i$2];
            stackTop = statusStack[statusStack.length - 1];
            charTypeCounts.set(charType, (charTypeCounts.get(charType) || 0) + 1);
            if (charType & NEUTRAL_ISOLATE_TYPES) {
              charTypeCounts.set(NEUTRAL_ISOLATE_TYPES, (charTypeCounts.get(NEUTRAL_ISOLATE_TYPES) || 0) + 1);
            }
            if (charType & FORMATTING_TYPES) {
              if (charType & (TYPE_RLE | TYPE_LRE)) {
                embedLevels[i$2] = stackTop._level;
                var level = (charType === TYPE_RLE ? nextOdd : nextEven)(stackTop._level);
                if (level <= MAX_DEPTH && !overflowIsolateCount && !overflowEmbeddingCount) {
                  statusStack.push({
                    _level: level,
                    _override: 0,
                    _isolate: 0
                  });
                } else if (!overflowIsolateCount) {
                  overflowEmbeddingCount++;
                }
              } else if (charType & (TYPE_RLO | TYPE_LRO)) {
                embedLevels[i$2] = stackTop._level;
                var level$1 = (charType === TYPE_RLO ? nextOdd : nextEven)(stackTop._level);
                if (level$1 <= MAX_DEPTH && !overflowIsolateCount && !overflowEmbeddingCount) {
                  statusStack.push({
                    _level: level$1,
                    _override: charType & TYPE_RLO ? TYPE_R : TYPE_L,
                    _isolate: 0
                  });
                } else if (!overflowIsolateCount) {
                  overflowEmbeddingCount++;
                }
              } else if (charType & ISOLATE_INIT_TYPES) {
                if (charType & TYPE_FSI) {
                  charType = determineAutoEmbedLevel(i$2 + 1, true) === 1 ? TYPE_RLI : TYPE_LRI;
                }
                embedLevels[i$2] = stackTop._level;
                if (stackTop._override) {
                  changeCharType(i$2, stackTop._override);
                }
                var level$2 = (charType === TYPE_RLI ? nextOdd : nextEven)(stackTop._level);
                if (level$2 <= MAX_DEPTH && overflowIsolateCount === 0 && overflowEmbeddingCount === 0) {
                  validIsolateCount++;
                  statusStack.push({
                    _level: level$2,
                    _override: 0,
                    _isolate: 1,
                    _isolInitIndex: i$2
                  });
                } else {
                  overflowIsolateCount++;
                }
              } else if (charType & TYPE_PDI) {
                if (overflowIsolateCount > 0) {
                  overflowIsolateCount--;
                } else if (validIsolateCount > 0) {
                  overflowEmbeddingCount = 0;
                  while (!statusStack[statusStack.length - 1]._isolate) {
                    statusStack.pop();
                  }
                  var isolInitIndex = statusStack[statusStack.length - 1]._isolInitIndex;
                  if (isolInitIndex != null) {
                    isolationPairs.set(isolInitIndex, i$2);
                    isolationPairs.set(i$2, isolInitIndex);
                  }
                  statusStack.pop();
                  validIsolateCount--;
                }
                stackTop = statusStack[statusStack.length - 1];
                embedLevels[i$2] = stackTop._level;
                if (stackTop._override) {
                  changeCharType(i$2, stackTop._override);
                }
              } else if (charType & TYPE_PDF) {
                if (overflowIsolateCount === 0) {
                  if (overflowEmbeddingCount > 0) {
                    overflowEmbeddingCount--;
                  } else if (!stackTop._isolate && statusStack.length > 1) {
                    statusStack.pop();
                    stackTop = statusStack[statusStack.length - 1];
                  }
                }
                embedLevels[i$2] = stackTop._level;
              } else if (charType & TYPE_B) {
                embedLevels[i$2] = paragraph.level;
              }
            } else {
              embedLevels[i$2] = stackTop._level;
              if (stackTop._override && charType !== TYPE_BN) {
                changeCharType(i$2, stackTop._override);
              }
            }
          }
          var levelRuns = [];
          var currentRun = null;
          for (var i$3 = paragraph.start; i$3 <= paragraph.end; i$3++) {
            var charType$1 = charTypes[i$3];
            if (!(charType$1 & BN_LIKE_TYPES)) {
              var lvl = embedLevels[i$3];
              var isIsolInit = charType$1 & ISOLATE_INIT_TYPES;
              var isPDI = charType$1 === TYPE_PDI;
              if (currentRun && lvl === currentRun._level) {
                currentRun._end = i$3;
                currentRun._endsWithIsolInit = isIsolInit;
              } else {
                levelRuns.push(currentRun = {
                  _start: i$3,
                  _end: i$3,
                  _level: lvl,
                  _startsWithPDI: isPDI,
                  _endsWithIsolInit: isIsolInit
                });
              }
            }
          }
          var isolatingRunSeqs = [];
          for (var runIdx = 0; runIdx < levelRuns.length; runIdx++) {
            var run = levelRuns[runIdx];
            if (!run._startsWithPDI || run._startsWithPDI && !isolationPairs.has(run._start)) {
              var seqRuns = [currentRun = run];
              for (var pdiIndex = void 0; currentRun && currentRun._endsWithIsolInit && (pdiIndex = isolationPairs.get(currentRun._end)) != null; ) {
                for (var i$4 = runIdx + 1; i$4 < levelRuns.length; i$4++) {
                  if (levelRuns[i$4]._start === pdiIndex) {
                    seqRuns.push(currentRun = levelRuns[i$4]);
                    break;
                  }
                }
              }
              var seqIndices = [];
              for (var i$5 = 0; i$5 < seqRuns.length; i$5++) {
                var run$1 = seqRuns[i$5];
                for (var j = run$1._start; j <= run$1._end; j++) {
                  seqIndices.push(j);
                }
              }
              var firstLevel = embedLevels[seqIndices[0]];
              var prevLevel = paragraph.level;
              for (var i$6 = seqIndices[0] - 1; i$6 >= 0; i$6--) {
                if (!(charTypes[i$6] & BN_LIKE_TYPES)) {
                  prevLevel = embedLevels[i$6];
                  break;
                }
              }
              var lastIndex = seqIndices[seqIndices.length - 1];
              var lastLevel = embedLevels[lastIndex];
              var nextLevel = paragraph.level;
              if (!(charTypes[lastIndex] & ISOLATE_INIT_TYPES)) {
                for (var i$7 = lastIndex + 1; i$7 <= paragraph.end; i$7++) {
                  if (!(charTypes[i$7] & BN_LIKE_TYPES)) {
                    nextLevel = embedLevels[i$7];
                    break;
                  }
                }
              }
              isolatingRunSeqs.push({
                _seqIndices: seqIndices,
                _sosType: Math.max(prevLevel, firstLevel) % 2 ? TYPE_R : TYPE_L,
                _eosType: Math.max(nextLevel, lastLevel) % 2 ? TYPE_R : TYPE_L
              });
            }
          }
          for (var seqIdx = 0; seqIdx < isolatingRunSeqs.length; seqIdx++) {
            var ref = isolatingRunSeqs[seqIdx];
            var seqIndices$1 = ref._seqIndices;
            var sosType = ref._sosType;
            var eosType = ref._eosType;
            var embedDirection = embedLevels[seqIndices$1[0]] & 1 ? TYPE_R : TYPE_L;
            if (charTypeCounts.get(TYPE_NSM)) {
              for (var si = 0; si < seqIndices$1.length; si++) {
                var i$8 = seqIndices$1[si];
                if (charTypes[i$8] & TYPE_NSM) {
                  var prevType = sosType;
                  for (var sj = si - 1; sj >= 0; sj--) {
                    if (!(charTypes[seqIndices$1[sj]] & BN_LIKE_TYPES)) {
                      prevType = charTypes[seqIndices$1[sj]];
                      break;
                    }
                  }
                  changeCharType(i$8, prevType & (ISOLATE_INIT_TYPES | TYPE_PDI) ? TYPE_ON : prevType);
                }
              }
            }
            if (charTypeCounts.get(TYPE_EN)) {
              for (var si$1 = 0; si$1 < seqIndices$1.length; si$1++) {
                var i$9 = seqIndices$1[si$1];
                if (charTypes[i$9] & TYPE_EN) {
                  for (var sj$1 = si$1 - 1; sj$1 >= -1; sj$1--) {
                    var prevCharType = sj$1 === -1 ? sosType : charTypes[seqIndices$1[sj$1]];
                    if (prevCharType & STRONG_TYPES) {
                      if (prevCharType === TYPE_AL) {
                        changeCharType(i$9, TYPE_AN);
                      }
                      break;
                    }
                  }
                }
              }
            }
            if (charTypeCounts.get(TYPE_AL)) {
              for (var si$2 = 0; si$2 < seqIndices$1.length; si$2++) {
                var i$10 = seqIndices$1[si$2];
                if (charTypes[i$10] & TYPE_AL) {
                  changeCharType(i$10, TYPE_R);
                }
              }
            }
            if (charTypeCounts.get(TYPE_ES) || charTypeCounts.get(TYPE_CS)) {
              for (var si$3 = 1; si$3 < seqIndices$1.length - 1; si$3++) {
                var i$11 = seqIndices$1[si$3];
                if (charTypes[i$11] & (TYPE_ES | TYPE_CS)) {
                  var prevType$1 = 0, nextType = 0;
                  for (var sj$2 = si$3 - 1; sj$2 >= 0; sj$2--) {
                    prevType$1 = charTypes[seqIndices$1[sj$2]];
                    if (!(prevType$1 & BN_LIKE_TYPES)) {
                      break;
                    }
                  }
                  for (var sj$3 = si$3 + 1; sj$3 < seqIndices$1.length; sj$3++) {
                    nextType = charTypes[seqIndices$1[sj$3]];
                    if (!(nextType & BN_LIKE_TYPES)) {
                      break;
                    }
                  }
                  if (prevType$1 === nextType && (charTypes[i$11] === TYPE_ES ? prevType$1 === TYPE_EN : prevType$1 & (TYPE_EN | TYPE_AN))) {
                    changeCharType(i$11, prevType$1);
                  }
                }
              }
            }
            if (charTypeCounts.get(TYPE_EN)) {
              for (var si$4 = 0; si$4 < seqIndices$1.length; si$4++) {
                var i$12 = seqIndices$1[si$4];
                if (charTypes[i$12] & TYPE_EN) {
                  for (var sj$4 = si$4 - 1; sj$4 >= 0 && charTypes[seqIndices$1[sj$4]] & (TYPE_ET | BN_LIKE_TYPES); sj$4--) {
                    changeCharType(seqIndices$1[sj$4], TYPE_EN);
                  }
                  for (si$4++; si$4 < seqIndices$1.length && charTypes[seqIndices$1[si$4]] & (TYPE_ET | BN_LIKE_TYPES | TYPE_EN); si$4++) {
                    if (charTypes[seqIndices$1[si$4]] !== TYPE_EN) {
                      changeCharType(seqIndices$1[si$4], TYPE_EN);
                    }
                  }
                }
              }
            }
            if (charTypeCounts.get(TYPE_ET) || charTypeCounts.get(TYPE_ES) || charTypeCounts.get(TYPE_CS)) {
              for (var si$5 = 0; si$5 < seqIndices$1.length; si$5++) {
                var i$13 = seqIndices$1[si$5];
                if (charTypes[i$13] & (TYPE_ET | TYPE_ES | TYPE_CS)) {
                  changeCharType(i$13, TYPE_ON);
                  for (var sj$5 = si$5 - 1; sj$5 >= 0 && charTypes[seqIndices$1[sj$5]] & BN_LIKE_TYPES; sj$5--) {
                    changeCharType(seqIndices$1[sj$5], TYPE_ON);
                  }
                  for (var sj$6 = si$5 + 1; sj$6 < seqIndices$1.length && charTypes[seqIndices$1[sj$6]] & BN_LIKE_TYPES; sj$6++) {
                    changeCharType(seqIndices$1[sj$6], TYPE_ON);
                  }
                }
              }
            }
            if (charTypeCounts.get(TYPE_EN)) {
              for (var si$6 = 0, prevStrongType = sosType; si$6 < seqIndices$1.length; si$6++) {
                var i$14 = seqIndices$1[si$6];
                var type = charTypes[i$14];
                if (type & TYPE_EN) {
                  if (prevStrongType === TYPE_L) {
                    changeCharType(i$14, TYPE_L);
                  }
                } else if (type & STRONG_TYPES) {
                  prevStrongType = type;
                }
              }
            }
            if (charTypeCounts.get(NEUTRAL_ISOLATE_TYPES)) {
              var R_TYPES_FOR_N_STEPS = TYPE_R | TYPE_EN | TYPE_AN;
              var STRONG_TYPES_FOR_N_STEPS = R_TYPES_FOR_N_STEPS | TYPE_L;
              var bracketPairs = [];
              {
                var openerStack = [];
                for (var si$7 = 0; si$7 < seqIndices$1.length; si$7++) {
                  if (charTypes[seqIndices$1[si$7]] & NEUTRAL_ISOLATE_TYPES) {
                    var char = string[seqIndices$1[si$7]];
                    var oppositeBracket = void 0;
                    if (openingToClosingBracket(char) !== null) {
                      if (openerStack.length < 63) {
                        openerStack.push({ char, seqIndex: si$7 });
                      } else {
                        break;
                      }
                    } else if ((oppositeBracket = closingToOpeningBracket(char)) !== null) {
                      for (var stackIdx = openerStack.length - 1; stackIdx >= 0; stackIdx--) {
                        var stackChar = openerStack[stackIdx].char;
                        if (stackChar === oppositeBracket || stackChar === closingToOpeningBracket(getCanonicalBracket(char)) || openingToClosingBracket(getCanonicalBracket(stackChar)) === char) {
                          bracketPairs.push([openerStack[stackIdx].seqIndex, si$7]);
                          openerStack.length = stackIdx;
                          break;
                        }
                      }
                    }
                  }
                }
                bracketPairs.sort(function(a, b) {
                  return a[0] - b[0];
                });
              }
              for (var pairIdx = 0; pairIdx < bracketPairs.length; pairIdx++) {
                var ref$1 = bracketPairs[pairIdx];
                var openSeqIdx = ref$1[0];
                var closeSeqIdx = ref$1[1];
                var foundStrongType = false;
                var useStrongType = 0;
                for (var si$8 = openSeqIdx + 1; si$8 < closeSeqIdx; si$8++) {
                  var i$15 = seqIndices$1[si$8];
                  if (charTypes[i$15] & STRONG_TYPES_FOR_N_STEPS) {
                    foundStrongType = true;
                    var lr = charTypes[i$15] & R_TYPES_FOR_N_STEPS ? TYPE_R : TYPE_L;
                    if (lr === embedDirection) {
                      useStrongType = lr;
                      break;
                    }
                  }
                }
                if (foundStrongType && !useStrongType) {
                  useStrongType = sosType;
                  for (var si$9 = openSeqIdx - 1; si$9 >= 0; si$9--) {
                    var i$16 = seqIndices$1[si$9];
                    if (charTypes[i$16] & STRONG_TYPES_FOR_N_STEPS) {
                      var lr$1 = charTypes[i$16] & R_TYPES_FOR_N_STEPS ? TYPE_R : TYPE_L;
                      if (lr$1 !== embedDirection) {
                        useStrongType = lr$1;
                      } else {
                        useStrongType = embedDirection;
                      }
                      break;
                    }
                  }
                }
                if (useStrongType) {
                  charTypes[seqIndices$1[openSeqIdx]] = charTypes[seqIndices$1[closeSeqIdx]] = useStrongType;
                  if (useStrongType !== embedDirection) {
                    for (var si$10 = openSeqIdx + 1; si$10 < seqIndices$1.length; si$10++) {
                      if (!(charTypes[seqIndices$1[si$10]] & BN_LIKE_TYPES)) {
                        if (getBidiCharType(string[seqIndices$1[si$10]]) & TYPE_NSM) {
                          charTypes[seqIndices$1[si$10]] = useStrongType;
                        }
                        break;
                      }
                    }
                  }
                  if (useStrongType !== embedDirection) {
                    for (var si$11 = closeSeqIdx + 1; si$11 < seqIndices$1.length; si$11++) {
                      if (!(charTypes[seqIndices$1[si$11]] & BN_LIKE_TYPES)) {
                        if (getBidiCharType(string[seqIndices$1[si$11]]) & TYPE_NSM) {
                          charTypes[seqIndices$1[si$11]] = useStrongType;
                        }
                        break;
                      }
                    }
                  }
                }
              }
              for (var si$12 = 0; si$12 < seqIndices$1.length; si$12++) {
                if (charTypes[seqIndices$1[si$12]] & NEUTRAL_ISOLATE_TYPES) {
                  var niRunStart = si$12, niRunEnd = si$12;
                  var prevType$2 = sosType;
                  for (var si2 = si$12 - 1; si2 >= 0; si2--) {
                    if (charTypes[seqIndices$1[si2]] & BN_LIKE_TYPES) {
                      niRunStart = si2;
                    } else {
                      prevType$2 = charTypes[seqIndices$1[si2]] & R_TYPES_FOR_N_STEPS ? TYPE_R : TYPE_L;
                      break;
                    }
                  }
                  var nextType$1 = eosType;
                  for (var si2$1 = si$12 + 1; si2$1 < seqIndices$1.length; si2$1++) {
                    if (charTypes[seqIndices$1[si2$1]] & (NEUTRAL_ISOLATE_TYPES | BN_LIKE_TYPES)) {
                      niRunEnd = si2$1;
                    } else {
                      nextType$1 = charTypes[seqIndices$1[si2$1]] & R_TYPES_FOR_N_STEPS ? TYPE_R : TYPE_L;
                      break;
                    }
                  }
                  for (var sj$7 = niRunStart; sj$7 <= niRunEnd; sj$7++) {
                    charTypes[seqIndices$1[sj$7]] = prevType$2 === nextType$1 ? prevType$2 : embedDirection;
                  }
                  si$12 = niRunEnd;
                }
              }
            }
          }
          for (var i$17 = paragraph.start; i$17 <= paragraph.end; i$17++) {
            var level$3 = embedLevels[i$17];
            var type$1 = charTypes[i$17];
            if (level$3 & 1) {
              if (type$1 & (TYPE_L | TYPE_EN | TYPE_AN)) {
                embedLevels[i$17]++;
              }
            } else {
              if (type$1 & TYPE_R) {
                embedLevels[i$17]++;
              } else if (type$1 & (TYPE_AN | TYPE_EN)) {
                embedLevels[i$17] += 2;
              }
            }
            if (type$1 & BN_LIKE_TYPES) {
              embedLevels[i$17] = i$17 === 0 ? paragraph.level : embedLevels[i$17 - 1];
            }
            if (i$17 === paragraph.end || getBidiCharType(string[i$17]) & (TYPE_S | TYPE_B)) {
              for (var j$1 = i$17; j$1 >= 0 && getBidiCharType(string[j$1]) & TRAILING_TYPES; j$1--) {
                embedLevels[j$1] = paragraph.level;
              }
            }
          }
        }
        return {
          levels: embedLevels,
          paragraphs
        };
        function determineAutoEmbedLevel(start, isFSI) {
          for (var i2 = start; i2 < string.length; i2++) {
            var charType2 = charTypes[i2];
            if (charType2 & (TYPE_R | TYPE_AL)) {
              return 1;
            }
            if (charType2 & (TYPE_B | TYPE_L) || isFSI && charType2 === TYPE_PDI) {
              return 0;
            }
            if (charType2 & ISOLATE_INIT_TYPES) {
              var pdi = indexOfMatchingPDI(i2);
              i2 = pdi === -1 ? string.length : pdi;
            }
          }
          return 0;
        }
        function indexOfMatchingPDI(isolateStart) {
          var isolationLevel = 1;
          for (var i2 = isolateStart + 1; i2 < string.length; i2++) {
            var charType2 = charTypes[i2];
            if (charType2 & TYPE_B) {
              break;
            }
            if (charType2 & TYPE_PDI) {
              if (--isolationLevel === 0) {
                return i2;
              }
            } else if (charType2 & ISOLATE_INIT_TYPES) {
              isolationLevel++;
            }
          }
          return -1;
        }
      }
      var data = "14>1,j>2,t>2,u>2,1a>g,2v3>1,1>1,1ge>1,1wd>1,b>1,1j>1,f>1,ai>3,-2>3,+1,8>1k0,-1jq>1y7,-1y6>1hf,-1he>1h6,-1h5>1ha,-1h8>1qi,-1pu>1,6>3u,-3s>7,6>1,1>1,f>1,1>1,+2,3>1,1>1,+13,4>1,1>1,6>1eo,-1ee>1,3>1mg,-1me>1mk,-1mj>1mi,-1mg>1mi,-1md>1,1>1,+2,1>10k,-103>1,1>1,4>1,5>1,1>1,+10,3>1,1>8,-7>8,+1,-6>7,+1,a>1,1>1,u>1,u6>1,1>1,+5,26>1,1>1,2>1,2>2,8>1,7>1,4>1,1>1,+5,b8>1,1>1,+3,1>3,-2>1,2>1,1>1,+2,c>1,3>1,1>1,+2,h>1,3>1,a>1,1>1,2>1,3>1,1>1,d>1,f>1,3>1,1a>1,1>1,6>1,7>1,13>1,k>1,1>1,+19,4>1,1>1,+2,2>1,1>1,+18,m>1,a>1,1>1,lk>1,1>1,4>1,2>1,f>1,3>1,1>1,+3,db>1,1>1,+3,3>1,1>1,+2,14qm>1,1>1,+1,6>1,4j>1,j>2,t>2,u>2,2>1,+1";
      var mirrorMap;
      function parse() {
        if (!mirrorMap) {
          var ref = parseCharacterMap(data, true);
          var map2 = ref.map;
          var reverseMap = ref.reverseMap;
          reverseMap.forEach(function(value, key) {
            map2.set(key, value);
          });
          mirrorMap = map2;
        }
      }
      function getMirroredCharacter(char) {
        parse();
        return mirrorMap.get(char) || null;
      }
      function getMirroredCharactersMap(string, embeddingLevels, start, end) {
        var strLen = string.length;
        start = Math.max(0, start == null ? 0 : +start);
        end = Math.min(strLen - 1, end == null ? strLen - 1 : +end);
        var map2 = /* @__PURE__ */ new Map();
        for (var i = start; i <= end; i++) {
          if (embeddingLevels[i] & 1) {
            var mirror = getMirroredCharacter(string[i]);
            if (mirror !== null) {
              map2.set(i, mirror);
            }
          }
        }
        return map2;
      }
      function getReorderSegments(string, embeddingLevelsResult, start, end) {
        var strLen = string.length;
        start = Math.max(0, start == null ? 0 : +start);
        end = Math.min(strLen - 1, end == null ? strLen - 1 : +end);
        var segments = [];
        embeddingLevelsResult.paragraphs.forEach(function(paragraph) {
          var lineStart = Math.max(start, paragraph.start);
          var lineEnd = Math.min(end, paragraph.end);
          if (lineStart < lineEnd) {
            var lineLevels = embeddingLevelsResult.levels.slice(lineStart, lineEnd + 1);
            for (var i = lineEnd; i >= lineStart && getBidiCharType(string[i]) & TRAILING_TYPES; i--) {
              lineLevels[i] = paragraph.level;
            }
            var maxLevel = paragraph.level;
            var minOddLevel = Infinity;
            for (var i$1 = 0; i$1 < lineLevels.length; i$1++) {
              var level = lineLevels[i$1];
              if (level > maxLevel) {
                maxLevel = level;
              }
              if (level < minOddLevel) {
                minOddLevel = level | 1;
              }
            }
            for (var lvl = maxLevel; lvl >= minOddLevel; lvl--) {
              for (var i$2 = 0; i$2 < lineLevels.length; i$2++) {
                if (lineLevels[i$2] >= lvl) {
                  var segStart = i$2;
                  while (i$2 + 1 < lineLevels.length && lineLevels[i$2 + 1] >= lvl) {
                    i$2++;
                  }
                  if (i$2 > segStart) {
                    segments.push([segStart + lineStart, i$2 + lineStart]);
                  }
                }
              }
            }
          }
        });
        return segments;
      }
      function getReorderedString(string, embedLevelsResult, start, end) {
        var indices = getReorderedIndices(string, embedLevelsResult, start, end);
        var chars = [].concat(string);
        indices.forEach(function(charIndex, i) {
          chars[i] = (embedLevelsResult.levels[charIndex] & 1 ? getMirroredCharacter(string[charIndex]) : null) || string[charIndex];
        });
        return chars.join("");
      }
      function getReorderedIndices(string, embedLevelsResult, start, end) {
        var segments = getReorderSegments(string, embedLevelsResult, start, end);
        var indices = [];
        for (var i = 0; i < string.length; i++) {
          indices[i] = i;
        }
        segments.forEach(function(ref) {
          var start2 = ref[0];
          var end2 = ref[1];
          var slice = indices.slice(start2, end2 + 1);
          for (var i2 = slice.length; i2--; ) {
            indices[end2 - i2] = slice[i2];
          }
        });
        return indices;
      }
      exports2.closingToOpeningBracket = closingToOpeningBracket;
      exports2.getBidiCharType = getBidiCharType;
      exports2.getBidiCharTypeName = getBidiCharTypeName;
      exports2.getCanonicalBracket = getCanonicalBracket;
      exports2.getEmbeddingLevels = getEmbeddingLevels;
      exports2.getMirroredCharacter = getMirroredCharacter;
      exports2.getMirroredCharactersMap = getMirroredCharactersMap;
      exports2.getReorderSegments = getReorderSegments;
      exports2.getReorderedIndices = getReorderedIndices;
      exports2.getReorderedString = getReorderedString;
      exports2.openingToClosingBracket = openingToClosingBracket;
      Object.defineProperty(exports2, "__esModule", { value: true });
      return exports2;
    }({});
    return bidi;
  }

  // ../genoffice/packages/pptx-render/src/auto-num.ts
  function toRoman(n) {
    const table = [
      [1e3, "m"],
      [900, "cm"],
      [500, "d"],
      [400, "cd"],
      [100, "c"],
      [90, "xc"],
      [50, "l"],
      [40, "xl"],
      [10, "x"],
      [9, "ix"],
      [5, "v"],
      [4, "iv"],
      [1, "i"]
    ];
    let out = "";
    for (const [v, s] of table)
      while (n >= v) {
        out += s;
        n -= v;
      }
    return out;
  }
  function toAlpha(n) {
    let out = "";
    while (n > 0) {
      n--;
      out = String.fromCharCode(97 + n % 26) + out;
      n = Math.floor(n / 26);
    }
    return out;
  }
  var CJK_DIGITS = "\u3007\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u4E03\u516B\u4E5D";
  function toCjkNum(n) {
    if (n <= 10) return n === 10 ? "\u5341" : CJK_DIGITS[n];
    if (n < 20) return "\u5341" + CJK_DIGITS[n % 10];
    if (n < 100)
      return CJK_DIGITS[Math.floor(n / 10)] + "\u5341" + (n % 10 ? CJK_DIGITS[n % 10] : "");
    return String(n);
  }
  function formatAutoNum(n, numType) {
    const t = numType ?? "arabicPeriod";
    if (t.startsWith("circleNum")) {
      if (t === "circleNumWdBlackPlain")
        return n <= 10 ? String.fromCodePoint(10101 + n) : n <= 20 ? String.fromCodePoint(9451 + (n - 11)) : String(n);
      return n <= 20 ? String.fromCodePoint(9311 + n) : String(n);
    }
    let body;
    if (t.startsWith("alphaLc")) body = toAlpha(n);
    else if (t.startsWith("alphaUc")) body = toAlpha(n).toUpperCase();
    else if (t.startsWith("romanLc")) body = toRoman(n);
    else if (t.startsWith("romanUc")) body = toRoman(n).toUpperCase();
    else if (t.startsWith("arabicDb"))
      body = [...String(n)].map((d) => String.fromCodePoint(65296 + Number(d))).join("");
    else if (t.startsWith("ea1Chs") || t.startsWith("ea1Cht")) body = toCjkNum(n);
    else body = String(n);
    if (t.endsWith("ParenBoth")) return `(${body})`;
    if (t.endsWith("ParenR")) return `${body})`;
    if (t.endsWith("Period")) return `${body}.`;
    if (t.endsWith("Plain")) return body;
    return `${body}.`;
  }

  // ../genoffice/packages/pptx-render/src/text-layout.ts
  var Buffer5 = Buffer2;
  var DEFAULT_FONT = "Arial";
  var DEFAULT_SIZE_PT = 18;
  var DEFAULT_INSETS_EMU = { l: 91440, t: 45720, r: 91440, b: 45720 };
  function hexAlpha(hex) {
    return hex && hex.length === 9 ? parseInt(hex.slice(7), 16) / 255 : 1;
  }
  function scaleHexAlpha(hex, factor) {
    if (factor >= 1) return hex;
    const a = Math.round(hexAlpha(hex) * factor * 255);
    return hex.slice(0, 7) + Math.max(0, Math.min(255, a)).toString(16).padStart(2, "0").toUpperCase();
  }
  function runStyle(run, scale2, fontScale) {
    const sizePt = (run.fontSize ?? DEFAULT_SIZE_PT) * (run.baseline ? 2 / 3 : 1);
    const effPt = fontScale !== 1 ? Math.max(1, Math.round(sizePt * fontScale)) : sizePt;
    const kernMinPt = run.kern ?? 12;
    return {
      fontFamily: run.fontFamily || DEFAULT_FONT,
      ...run.fontScriptHint != null ? { substScript: run.fontScriptHint } : {},
      ...run.text && !hasWideChar(run.text) ? { latinOnly: true } : {},
      fontSizePx: ptToPx(effPt, scale2),
      bold: !!run.bold,
      italic: !!run.italic,
      kerning: kernMinPt > 0 && effPt >= kernMinPt
    };
  }
  var HEAVY_FAMILY_RE = /\s(?:black|heavy|(?:extra|ultra)[- ]?bold)$/i;
  var HG_HEAVY_RE = /^HG.*(?:UB|EB)$/;
  var LIGHT_FAMILY_RE = /\s(?:thin|hairline|(?:extra|ultra|semi)?[- ]?light)$/i;
  function substituteStyle(tok, metrics) {
    const st = tok.style;
    let next;
    if (st.bold && LIGHT_FAMILY_RE.test(st.fontFamily)) next = { ...st, bold: false };
    if (metrics.substituted?.(st)) {
      if (st.kerning !== false) next = { ...next ?? st, kerning: false };
      if (!st.bold && (HEAVY_FAMILY_RE.test(st.fontFamily) || HG_HEAVY_RE.test(st.fontFamily)))
        next = { ...next ?? st, bold: true };
    }
    return next ? { ...tok, style: next } : tok;
  }
  function tokenWidth(tok, metrics) {
    if (tok.wOverride != null) return tok.wOverride;
    const w = metrics.measure(tok.text, tok.style);
    return tok.ls ? w + tok.ls * [...tok.text].length : w;
  }
  function applyCap(text, cap) {
    if (cap !== "all" && cap !== "small") return text;
    let out = "";
    for (const ch of text) {
      const u = ch.toUpperCase();
      out += [...u].length === 1 ? u : ch;
    }
    return out;
  }
  var SYMBOL_TO_UNICODE = {
    34: 8704,
    36: 8707,
    39: 8715,
    42: 8727,
    45: 8722,
    64: 8773,
    65: 913,
    66: 914,
    67: 935,
    68: 916,
    69: 917,
    70: 934,
    71: 915,
    72: 919,
    73: 921,
    74: 977,
    75: 922,
    76: 923,
    77: 924,
    78: 925,
    79: 927,
    80: 928,
    81: 920,
    82: 929,
    83: 931,
    84: 932,
    85: 933,
    86: 962,
    87: 937,
    88: 926,
    89: 936,
    90: 918,
    92: 8756,
    94: 8869,
    96: 8254,
    97: 945,
    98: 946,
    99: 967,
    100: 948,
    101: 949,
    102: 966,
    103: 947,
    104: 951,
    105: 953,
    106: 981,
    107: 954,
    108: 955,
    109: 956,
    110: 957,
    111: 959,
    112: 960,
    113: 952,
    114: 961,
    115: 963,
    116: 964,
    117: 965,
    118: 982,
    119: 969,
    120: 958,
    121: 968,
    122: 950,
    126: 8764,
    161: 978,
    162: 8242,
    163: 8804,
    164: 8260,
    165: 8734,
    166: 402,
    167: 9827,
    168: 9830,
    169: 9829,
    170: 9824,
    171: 8596,
    172: 8592,
    173: 8593,
    174: 8594,
    175: 8595,
    176: 176,
    177: 177,
    178: 8243,
    179: 8805,
    180: 215,
    181: 8733,
    182: 8706,
    183: 8226,
    184: 247,
    185: 8800,
    186: 8801,
    187: 8776,
    188: 8230,
    191: 8629,
    192: 8501,
    193: 8465,
    194: 8476,
    195: 8472,
    196: 8855,
    197: 8853,
    198: 8709,
    199: 8745,
    200: 8746,
    201: 8835,
    202: 8839,
    203: 8836,
    204: 8834,
    205: 8838,
    206: 8712,
    207: 8713,
    208: 8736,
    209: 8711,
    210: 174,
    211: 169,
    212: 8482,
    213: 8719,
    214: 8730,
    215: 8901,
    216: 172,
    217: 8743,
    218: 8744,
    219: 8660,
    220: 8656,
    221: 8657,
    222: 8658,
    223: 8659,
    224: 9674,
    225: 9001,
    229: 8721,
    241: 9002,
    242: 8747
  };
  var SYMBOL_FONT_RE = /^symbol$/i;
  function symbolRunText(text) {
    let out = "";
    for (const ch of text) {
      let cp = ch.codePointAt(0) ?? 0;
      if (cp >= 61440 && cp <= 61695) cp -= 61440;
      const fallback = cp >= 32 && cp <= 127 ? cp : ch.codePointAt(0) ?? 0;
      out += String.fromCodePoint(SYMBOL_TO_UNICODE[cp] ?? fallback);
    }
    return out;
  }
  function hasWideChar(text) {
    for (const ch of text) if (isWideChar(ch.codePointAt(0) ?? 0)) return true;
    return false;
  }
  var LATIN_WORD_RE = /^[\u0020-\u024f\u1e00-\u1eff\u2000-\u206f\u20a0-\u20cf\u2100-\u214f]+$/;
  var HALFWIDTH_KANA_RE = /[\uff61-\uff9f]/;
  function tokenizeParagraph(p, scale2, fontScale) {
    const tokens = [];
    p.runs.forEach((run, srcRun) => {
      const style = runStyle(run, scale2, fontScale);
      let latinStyle;
      const eaText = hasWideChar(run.text) || HALFWIDTH_KANA_RE.test(run.text);
      if (run.latinFamily || run.fontScriptHint != null && eaText) {
        latinStyle = { ...style, fontFamily: run.latinFamily ?? style.fontFamily, latinOnly: true };
        delete latinStyle.substScript;
      }
      const color = run.color ?? "#000000";
      const underline = !!run.underline;
      const ls = run.letterSpacing ? ptToPx(run.letterSpacing, scale2) * fontScale : 0;
      const blShift = run.baseline ? style.fontSizePx * 1.5 * (run.baseline / 100) : 0;
      const base = {
        style,
        color,
        underline,
        ls,
        srcRun,
        ...run.fontFamily ? { srcFont: run.fontFamily } : {},
        ...run.hyperlink ? { link: run.hyperlink } : {},
        ...run.strike ? { strike: true } : {},
        ...run.highlight ? { highlight: run.highlight } : {},
        ...run.baseline ? { blPct: run.baseline } : {},
        ...blShift ? { blShift } : {},
        ...run.outline ? {
          outline: {
            color: run.outline.color,
            widthPx: emuToPx(run.outline.widthEmu, scale2) * fontScale
          }
        } : {},
        ...run.gradient ? {
          gradient: {
            stops: run.gradient.stops.map((s) => ({ pos: s.pos, color: s.color })),
            // OOXML gradient angle is 1/60000° clockwise from the +x axis
            angleDeg: (run.gradient.angle ?? 54e5) / 6e4,
            ...run.gradient.scaled ? { scaled: true } : {}
          }
        } : {},
        ...run.glow ? {
          glow: {
            color: run.glow.color,
            blurPx: emuToPx(run.glow.radius, scale2) * fontScale
          }
        } : {},
        ...run.reflection ? { reflection: true } : {},
        ...run.shadow ? {
          shadow: {
            // A translucent fill dims its own shadow (PowerPoint-observed): scale the
            // shadow alpha by the text fill alpha
            color: scaleHexAlpha(run.shadow.color, hexAlpha(run.color)),
            blurPx: emuToPx(run.shadow.blurRad, scale2) * fontScale,
            offsetX: emuToPx(run.shadow.dist, scale2) * fontScale * Math.cos(run.shadow.dirDeg * Math.PI / 180),
            offsetY: emuToPx(run.shadow.dist, scale2) * fontScale * Math.sin(run.shadow.dirDeg * Math.PI / 180)
          }
        } : {}
      };
      let buf = "";
      const flushWord = () => {
        if (!buf) return;
        const wordBase = latinStyle && LATIN_WORD_RE.test(buf) ? { ...base, style: latinStyle } : base;
        if (WORD_SEG && SEA_RE.test(buf)) {
          for (const s of WORD_SEG.segment(buf)) {
            tokens.push({ ...wordBase, text: s.segment, breakable: true, isSpace: false });
          }
        } else {
          tokens.push({ ...wordBase, text: buf, breakable: false, isSpace: false });
        }
        buf = "";
      };
      const runText = SYMBOL_FONT_RE.test(style.fontFamily) ? symbolRunText(run.text) : applyCap(run.text, run.cap);
      for (const ch of graphemes(runText)) {
        const cp = ch.codePointAt(0) ?? 0;
        if (ch === "\n" || ch === "\v") {
          flushWord();
          tokens.push({ ...base, text: "\n", breakable: true, isSpace: false, isBreak: true });
        } else if (ch === " " || ch === "\u3000") {
          flushWord();
          tokens.push({ ...base, text: ch, breakable: true, isSpace: true });
        } else if (ch === "	") {
          flushWord();
          tokens.push({ ...base, text: ch, breakable: true, isSpace: true, isTab: true });
        } else if (ch === "\xA0") {
          buf += " ";
        } else if (isWideChar(cp) && (!isHangul(cp) || p.latinLnBrk)) {
          flushWord();
          tokens.push({ ...base, text: ch, breakable: true, isSpace: false });
        } else if (BREAK_AFTER_DASH.has(cp) && buf) {
          buf += ch;
          flushWord();
        } else {
          buf += ch;
        }
      }
      flushWord();
    });
    return tokens;
  }
  var AutoNumCounter = class {
    counts = [];
    schemes = [];
    starts = [];
    /** Number of a numbered text paragraph; undefined for anything else (state still advances). */
    next(p, hasText) {
      if (!hasText) return void 0;
      const lvl = Number.isFinite(p.level) ? Math.max(0, Math.min(8, Math.trunc(p.level))) : 0;
      const b = p.bullet;
      const from = b?.type === "number" ? lvl + 1 : lvl;
      for (let l = from; l < this.counts.length; l++) this.counts[l] = 0;
      if (b?.type !== "number") return void 0;
      const scheme = b.numType ?? "arabicPeriod";
      const start = b.startAt ?? 1;
      const running = this.counts[lvl] && this.schemes[lvl] === scheme && start === this.starts[lvl];
      const n = running ? this.counts[lvl] + 1 : start;
      if (!running) this.starts[lvl] = start;
      this.counts[lvl] = n;
      this.schemes[lvl] = scheme;
      return n;
    }
  };
  function bulletRunStyle(base, b, scale2, fontScale) {
    if (b?.sizePt != null) {
      const pt = fontScale !== 1 ? Math.max(1, Math.round(b.sizePt * fontScale)) : b.sizePt;
      return { ...base, fontSizePx: ptToPx(pt, scale2) };
    }
    if (b?.sizePct != null) return { ...base, fontSizePx: base.fontSizePx * (b.sizePct / 100) };
    return base;
  }
  var isBulletKind = (t) => t === "char" || t === "number" || t === "blip";
  var imageAspectCache = /* @__PURE__ */ new Map();
  var IMAGE_ASPECT_CACHE_MAX = 256;
  function imageAspect(dataUrl) {
    const key = cacheKeyFor(dataUrl);
    const cached = imageAspectCache.get(key);
    if (cached != null) {
      imageAspectCache.delete(key);
      imageAspectCache.set(key, cached);
      return cached;
    }
    let ratio = 1;
    const comma = dataUrl.indexOf(",");
    if (comma > 0 && /;base64$/i.test(dataUrl.slice(0, comma))) {
      try {
        const bytes = base64Head(dataUrl.slice(comma + 1), 64 * 1024);
        const be32 = (o) => (bytes[o] << 24 | bytes[o + 1] << 16 | bytes[o + 2] << 8 | bytes[o + 3]) >>> 0;
        if (bytes[0] === 137 && bytes[1] === 80 && bytes.length >= 24) {
          ratio = be32(16) / be32(20);
        } else if (bytes[0] === 71 && bytes[1] === 73 && bytes.length >= 10) {
          ratio = (bytes[6] | bytes[7] << 8) / (bytes[8] | bytes[9] << 8);
        } else if (bytes[0] === 255 && bytes[1] === 216) {
          for (let o = 2; o + 9 < bytes.length; ) {
            if (bytes[o] !== 255) break;
            const marker = bytes[o + 1];
            const len = bytes[o + 2] << 8 | bytes[o + 3];
            const sof = marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker);
            if (sof) {
              const h = bytes[o + 5] << 8 | bytes[o + 6];
              const w = bytes[o + 7] << 8 | bytes[o + 8];
              ratio = w / h;
              break;
            }
            o += 2 + len;
          }
        }
      } catch {
        ratio = 1;
      }
    }
    if (!Number.isFinite(ratio) || ratio <= 0) ratio = 1;
    if (imageAspectCache.size >= IMAGE_ASPECT_CACHE_MAX) {
      const oldest = imageAspectCache.keys().next();
      if (!oldest.done) imageAspectCache.delete(oldest.value);
    }
    imageAspectCache.set(key, ratio);
    return ratio;
  }
  function base64Head(b64, maxBytes) {
    const chunk = b64.slice(0, Math.ceil(maxBytes * 4 / 3));
    const aligned = chunk.slice(0, chunk.length - chunk.length % 4);
    if (typeof atob === "function") {
      const bin = atob(aligned);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    return new Uint8Array(Buffer5.from(aligned, "base64"));
  }
  var SYMBOL_BULLET_RE = /^(wingdings|webdings)/i;
  function symbolBulletText(font, char) {
    if (!font) return void 0;
    if (SYMBOL_FONT_RE.test(font)) return symbolRunText(char);
    if (!SYMBOL_BULLET_RE.test(font)) return void 0;
    const cp = char.codePointAt(0) ?? 0;
    if (cp >= 61440 && cp <= 61695) return char;
    return cp >= 32 && cp <= 255 ? String.fromCodePoint(61440 + cp) : char;
  }
  var KINSOKU_NO_START = new Set(
    "\u3001\u3002\u3005,.!?:;)]}%\uFF0C\uFF0E\uFF01\uFF1F\uFF1A\uFF1B\uFF09\uFF3D\uFF5D\uFF05\u3009\u300B\u300D\u300F\u3011\u3015\u301F\uFF61\uFF63\uFF64\uFF65\uFF70\uFF9E\uFF9F\u30FB\u30FC\u3041\u3043\u3045\u3047\u3049\u3063\u3083\u3085\u3087\u308E\u3095\u3096\u30A1\u30A3\u30A5\u30A7\u30A9\u30C3\u30E3\u30E5\u30E7\u30EE\u30F5\u30F6\u309B\u309C\u309D\u309E\u30FD\u30FE"
  );
  var KINSOKU_NO_END = new Set("([{$\uFF08\uFF3B\uFF5B\uFF04\u3008\u300A\u300C\u300E\u3010\u3014\u301D\uFF62\xA3\xA5\uFFE1\uFFE5");
  var kinsokuNoStart = (t) => KINSOKU_NO_START.has(t.text);
  var kinsokuNoEnd = (t) => KINSOKU_NO_END.has(t.text);
  function isHangul(cp) {
    return cp >= 44032 && cp <= 55203 || cp >= 4352 && cp <= 4607 || cp >= 12592 && cp <= 12687 || cp >= 43360 && cp <= 43391 || cp >= 55216 && cp <= 55295;
  }
  var HANGING_PUNCT = new Set("\u3001\u3002\uFF0C\uFF0E,.)]}\uFF09\uFF3D\uFF5D\u3009\u300B\u300D\u300F\u3011\u3015\u3017\u3019\u301B!?\uFF01\uFF1F:;\uFF1A\uFF1B");
  function hangingTailWidth(tok, metrics) {
    const last = [...tok.text].pop();
    if (!last || !HANGING_PUNCT.has(last)) return 0;
    return tokenWidth({ ...tok, text: last, wOverride: void 0 }, metrics);
  }
  var BREAK_AFTER_DASH = /* @__PURE__ */ new Set([45, 8208, 8210, 8211, 8212]);
  var SEA_RE = /[฀-໿က-႟ក-៿]/;
  var WORD_SEG = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(void 0, { granularity: "word" }) : null;
  var RTL_RE = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/;
  var bidiApi = null;
  function applyBidi(tokens, baseRtl) {
    const text = tokens.map((t) => t.text).join("");
    if (!RTL_RE.test(text) && !baseRtl) return tokens;
    bidiApi ??= bidiFactory();
    const { levels } = bidiApi.getEmbeddingLevels(
      text,
      baseRtl == null ? void 0 : baseRtl ? "rtl" : "ltr"
    );
    const out = [];
    let off = 0;
    for (const tok of tokens) {
      const end = off + tok.text.length;
      let segStart = off;
      for (let i = off + 1; i <= end; i++) {
        if (i === end || levels[i] !== levels[segStart]) {
          out.push({ ...tok, text: text.slice(segStart, i), level: levels[segStart] ?? 0 });
          segStart = i;
        }
      }
      off = end;
    }
    return out;
  }
  function visualOrder(toks) {
    let max = 0;
    let minOdd = Infinity;
    for (const t of toks) {
      const lv = t.level ?? 0;
      if (lv > max) max = lv;
      if (lv % 2 === 1 && lv < minOdd) minOdd = lv;
    }
    if (minOdd === Infinity) return toks;
    const arr = [...toks];
    for (let l = max; l >= minOdd; l--) {
      for (let i = 0; i < arr.length; ) {
        if ((arr[i].level ?? 0) >= l) {
          let j = i;
          while (j < arr.length && (arr[j].level ?? 0) >= l) j++;
          for (let a = i, b = j - 1; a < b; a++, b--) {
            const t = arr[a];
            arr[a] = arr[b];
            arr[b] = t;
          }
          i = j;
        } else {
          i++;
        }
      }
    }
    return arr;
  }
  function paraBaseRtl(p) {
    if (p.rtl != null) return p.rtl;
    for (const r of p.runs) {
      for (const ch of r.text) {
        if (RTL_RE.test(ch)) return true;
        if (/[A-Za-z\u00c0-\u058f\u0900-\ud7ff\uf900-\ufdcf]/.test(ch)) return false;
      }
    }
    return false;
  }
  function layoutParagraph(p, availWidth, wrap, metrics, scale2, fontScale, lnSpcRed = 0, firstLineShrinkPx = 0, tabs) {
    const tokens = applyBidi(tokenizeParagraph(p, scale2, fontScale), p.rtl).map(
      (tok, logicalOrder) => ({
        ...substituteStyle(tok, metrics),
        logicalOrder
      })
    );
    const lines = [];
    let cur = [];
    let curW = 0;
    const pushLine = (toks) => {
      let trailingSpace = false;
      let trailingText = "";
      while (toks.length && toks[toks.length - 1].isSpace) {
        trailingText = toks.pop().text + trailingText;
        trailingSpace = true;
      }
      if (!toks.length) {
        const src = p.runs[0];
        const st = src ? runStyle(src, scale2, fontScale) : {
          fontFamily: DEFAULT_FONT,
          fontSizePx: ptToPx(
            fontScale !== 1 ? Math.max(1, Math.round(DEFAULT_SIZE_PT * fontScale)) : DEFAULT_SIZE_PT,
            scale2
          ),
          bold: false,
          italic: false
        };
        const m = metrics.metrics(st);
        const box = lineH(p, st.fontSizePx, scale2, lnSpcRed);
        const leadAbove = baselineOff(p, box, m.descent) - m.ascent;
        lines.push({
          runs: src ? [
            {
              text: "",
              x: 0,
              baselineY: 0,
              fontFamily: st.fontFamily,
              ...src.fontFamily ? { srcFontFamily: src.fontFamily } : {},
              fontSizePx: st.fontSizePx,
              color: src.color ?? "#000000",
              bold: st.bold,
              italic: st.italic,
              underline: !!src.underline,
              widthPx: 0,
              srcRunIdx: 0,
              ascentPx: m.ascent
            }
          ] : [],
          height: box,
          ...leadAbove ? { leadAbove } : {},
          ascent: m.ascent,
          descent: m.descent,
          singleH: PPT_SINGLE * st.fontSizePx,
          ...trailingSpace ? { trailingSpace, trailingText } : {}
        });
        return;
      }
      const line2 = buildLine(toks, metrics, p, scale2, lnSpcRed);
      if (trailingSpace) {
        line2.trailingSpace = true;
        line2.trailingText = trailingText;
      }
      lines.push(line2);
    };
    const hangingOn = p.hangingPunct !== false && p.runs.some((r) => hasWideChar(r.text));
    let endedWithBreak = false;
    for (const tok of tokens) {
      if (tok.isBreak) {
        pushLine(cur);
        lines[lines.length - 1].softBreakAfter = tok.srcRun;
        cur = [];
        curW = 0;
        endedWithBreak = true;
        continue;
      }
      endedWithBreak = false;
      if (tok.isTab && tabs) {
        const cursor = tabs.originPx + (lines.length === 0 ? firstLineShrinkPx : 0) + curW;
        const stop = tabs.stopsPx.find((s) => s > cursor + 0.5);
        tok.wOverride = Math.max(
          (stop ?? (Math.floor(cursor / tabs.defaultPx) + 1) * tabs.defaultPx) - cursor,
          0
        );
      }
      const w = tokenWidth(tok, metrics);
      const lineAvail = () => lines.length === 0 ? availWidth - firstLineShrinkPx : availWidth;
      const hangW = hangingOn && !tok.isSpace ? hangingTailWidth(tok, metrics) : 0;
      if (wrap && cur.length && curW + w - hangW > lineAvail() && !tok.isSpace) {
        const carry = [];
        while (cur.length > 1) {
          const head = carry[0] ?? tok;
          const last = cur[cur.length - 1];
          if (last.isSpace || p.eaLnBrk === false) break;
          if (!kinsokuNoStart(head) && !kinsokuNoEnd(last)) break;
          carry.unshift(cur.pop());
        }
        pushLine(cur);
        cur = carry;
        curW = carry.reduce((s, t) => s + tokenWidth(t, metrics), 0);
      }
      if (wrap && !cur.length && w - hangW > lineAvail() && tok.text.length > 1 && !tok.isSpace) {
        const segs = hardBreak(tok, lineAvail(), metrics);
        for (const seg of segs.slice(0, -1)) pushLine([seg]);
        const tail = segs[segs.length - 1];
        cur.push(tail);
        curW += tokenWidth(tail, metrics);
        continue;
      }
      cur.push(tok);
      curW += w;
    }
    if (cur.length) pushLine(cur);
    else if (endedWithBreak) pushLine([]);
    if (!lines.length) pushLine([]);
    return lines;
  }
  function hardBreak(tok, availWidth, metrics) {
    const out = [];
    const clusterW = /* @__PURE__ */ new Map();
    let buf = "";
    let bufW = 0;
    for (const ch of graphemes(tok.text)) {
      let cw = clusterW.get(ch);
      if (cw === void 0) {
        cw = tokenWidth({ ...tok, text: ch }, metrics);
        clusterW.set(ch, cw);
      }
      if (buf && bufW + cw > availWidth) {
        out.push({ ...tok, text: buf });
        buf = ch;
        bufW = cw;
      } else {
        buf += ch;
        bufW += cw;
      }
    }
    if (buf) out.push({ ...tok, text: buf });
    return out;
  }
  function buildLine(toks, metrics, p, scale2, lnSpcRed = 0) {
    let x = 0;
    let ascent = 0;
    let descent = 0;
    let sizeM = 0;
    const runs = [];
    for (const tok of visualOrder(toks)) {
      const m = metrics.metrics(tok.style);
      ascent = Math.max(ascent, m.ascent);
      descent = Math.max(descent, m.descent);
      sizeM = Math.max(sizeM, tok.style.fontSizePx);
      const w = tokenWidth(tok, metrics);
      runs.push({
        text: tok.text,
        x,
        baselineY: 0,
        // filled in later from the line's ascent
        // When a missing font is substituted, draw with the substitute name so drawing and measuring use the same font file
        fontFamily: metrics.displayFamily?.(tok.style, tok.text) ?? tok.style.fontFamily,
        ...tok.srcFont ? { srcFontFamily: tok.srcFont } : {},
        fontSizePx: tok.style.fontSizePx,
        color: tok.color,
        bold: tok.style.bold,
        italic: tok.style.italic,
        underline: tok.underline,
        ...tok.strike ? { strike: true } : {},
        ...tok.highlight ? { highlight: tok.highlight } : {},
        widthPx: w,
        ...tok.ls ? { letterSpacingPx: tok.ls } : {},
        ...tok.style.kerning === false ? { kerningOff: true } : {},
        ...tok.outline ? { outline: tok.outline } : {},
        ...tok.gradient ? { gradient: tok.gradient } : {},
        ...tok.glow ? { glow: tok.glow } : {},
        ...tok.reflection ? { reflection: true } : {},
        ...tok.shadow ? { shadow: tok.shadow } : {},
        ...tok.blShift ? { baselineShiftPx: tok.blShift } : {},
        ...tok.blPct ? { baselinePct: tok.blPct } : {},
        ...tok.level != null && tok.level % 2 === 1 ? { rtl: true } : {},
        srcRunIdx: tok.srcRun,
        ...tok.link ? { link: tok.link } : {},
        ...tok.logicalOrder != null ? { logicalOrder: tok.logicalOrder } : {},
        ascentPx: m.ascent
      });
      x += w;
    }
    const box = lineH(p, sizeM, scale2, lnSpcRed);
    const leadAbove = baselineOff(p, box, descent) - ascent;
    return {
      runs,
      height: box,
      ...leadAbove ? { leadAbove } : {},
      ascent,
      descent,
      singleH: PPT_SINGLE * sizeM
    };
  }
  var PPT_SINGLE = 1.2;
  var PPT_BASELINE_FRAC = 0.88 / 1.2;
  function lineH(p, sizePx, scale2, lnSpcRed = 0) {
    if (p.lineExact != null) return ptToPx(p.lineExact, scale2);
    const single = PPT_SINGLE * sizePx;
    const base = p.lineHeight != null ? single * (p.lineHeight / 100) : single;
    return base * (1 - lnSpcRed);
  }
  function baselineOff(p, box, descent) {
    if (p.lineExact != null || p.lineHeight != null && p.lineHeight !== 100) {
      return PPT_BASELINE_FRAC * box;
    }
    return box - descent;
  }
  function flowIntoColumns(result, availHeight, numCol, stride) {
    const out = [];
    let col = 0;
    let colTop = 0;
    let maxBottom = 0;
    for (const ln of result.lines) {
      let top = ln.top - colTop;
      if (col < numCol - 1 && top > 0 && top + ln.height > availHeight) {
        col += 1;
        colTop = ln.top;
        top = 0;
      }
      const dx = col * stride;
      const dy = top - ln.top;
      out.push({
        ...ln,
        top,
        runs: dx || dy ? ln.runs.map((r) => ({ ...r, x: r.x + dx, baselineY: r.baselineY + dy })) : ln.runs
      });
      maxBottom = Math.max(maxBottom, top + ln.height);
    }
    return { lines: out, contentHeight: maxBottom };
  }
  function layoutText(input) {
    const { body, boxWidthPx, boxHeightPx, metrics, vp } = input;
    const insets = {
      l: emuToPx(body.insets?.l ?? DEFAULT_INSETS_EMU.l, vp.scale),
      t: emuToPx(body.insets?.t ?? DEFAULT_INSETS_EMU.t, vp.scale),
      r: emuToPx(body.insets?.r ?? DEFAULT_INSETS_EMU.r, vp.scale),
      b: emuToPx(body.insets?.b ?? DEFAULT_INSETS_EMU.b, vp.scale)
    };
    const availWidth = Math.max(boxWidthPx - insets.l - insets.r, 1);
    const availHeight = Math.max(boxHeightPx - insets.t - insets.b, 1);
    const wrap = body.wrap !== false;
    if (body.vert === "vert" || body.vert === "vert270") return layoutTextRotated(input, body.vert);
    if (body.vert)
      return {
        ...layoutTextVertical(
          body,
          body.vert,
          availWidth,
          availHeight,
          insets,
          wrap,
          metrics,
          vp.scale
        ),
        autofit: body.autofit ?? "none"
      };
    const numCol = body.numCol && body.numCol > 1 ? Math.floor(body.numCol) : 1;
    const colGapPx = numCol > 1 ? emuToPx(body.spcCol ?? 0, vp.scale) : 0;
    const colWidth = numCol > 1 ? Math.max((availWidth - (numCol - 1) * colGapPx) / numCol, 1) : availWidth;
    const build = (fontScale2, lnSpcRed) => layoutAll(
      body,
      colWidth,
      wrap,
      metrics,
      vp.scale,
      fontScale2,
      lnSpcRed,
      input.trimEdgeSpacing,
      input.media
    );
    const storedScale = body.autofit === "shrink" ? body.fontScale ?? 1 : 1;
    const storedRed = body.autofit === "shrink" ? body.lnSpcReduction ?? 0 : 0;
    let fontScale = storedScale;
    let lnSpcReduction = storedRed;
    let result = build(fontScale, lnSpcReduction);
    const fitSpan = (r) => {
      let top;
      let bottom;
      for (const ln of r.lines) {
        if (!ln.runs.some((run) => run.text.trim())) continue;
        top ??= ln.top;
        bottom = ln.top + ln.height;
      }
      return bottom === void 0 ? r.contentHeight : bottom - (top ?? 0);
    };
    const fitTarget = availHeight * numCol;
    if (body.autofit === "shrink" && (input.refitAutofit || body.fontScale == null) && fitSpan(result) > fitTarget * 1.03) {
      for (const [fs, red] of SHRINK_STEPS) {
        if (fs >= storedScale - 1e-6) continue;
        const effRed = Math.max(red, storedRed);
        const r = build(fs, effRed);
        fontScale = fs;
        lnSpcReduction = effRed;
        result = r;
        if (fitSpan(r) <= fitTarget) break;
      }
    }
    if (numCol > 1) result = flowIntoColumns(result, availHeight, numCol, colWidth + colGapPx);
    const anchor = body.anchor ?? "top";
    const extraH = availHeight - (result.inkBottom ?? result.contentHeight);
    const dy = anchor === "middle" ? extraH / 2 : anchor === "bottom" ? extraH : 0;
    let dxCtr = 0;
    if (body.anchorCtr && numCol === 1) {
      let minX = Infinity;
      let maxX = -Infinity;
      for (const ln of result.lines) {
        for (const r of ln.runs) {
          if (!r.text) continue;
          if (r.x < minX) minX = r.x;
          if (r.x + r.widthPx > maxX) maxX = r.x + r.widthPx;
        }
      }
      if (maxX > minX) dxCtr = (availWidth - (maxX - minX)) / 2 - minX;
    }
    const lines = dy || dxCtr ? result.lines.map((ln) => ({
      ...ln,
      top: ln.top + dy,
      runs: ln.runs.map((r) => ({ ...r, x: r.x + dxCtr, baselineY: r.baselineY + dy }))
    })) : result.lines;
    let extrusion;
    if (body.extrusion3d) {
      const e = body.extrusion3d;
      const d = emuToPx(e.depthEmu, vp.scale);
      const la = e.latDeg * Math.PI / 180;
      const lo = e.lonDeg * Math.PI / 180;
      extrusion = {
        color: e.color,
        dx: -d * Math.sin(lo),
        dy: d * Math.sin(la) * Math.cos(lo)
      };
    }
    return {
      lines,
      insets,
      anchor,
      fontScale,
      ...lnSpcReduction ? { lnSpcReduction } : {},
      contentHeight: result.contentHeight,
      ...result.inkBottom ? { inkBottom: result.inkBottom } : {},
      wrap,
      autofit: body.autofit ?? "none",
      ...extrusion ? { extrusion } : {},
      ...body.txWarp ? { txWarp: body.txWarp } : {}
    };
  }
  var SHRINK_STEPS = [
    [0.925, 0],
    [0.85, 0.1],
    [0.775, 0.1],
    [0.7, 0.2],
    [0.625, 0.2],
    [0.55, 0.2],
    [0.475, 0.2],
    [0.4, 0.2],
    [0.325, 0.2],
    [0.25, 0.2]
  ];
  function layoutTextRotated(input, vert) {
    const { body, boxWidthPx, boxHeightPx, vp } = input;
    const ins = {
      l: body.insets?.l ?? DEFAULT_INSETS_EMU.l,
      t: body.insets?.t ?? DEFAULT_INSETS_EMU.t,
      r: body.insets?.r ?? DEFAULT_INSETS_EMU.r,
      b: body.insets?.b ?? DEFAULT_INSETS_EMU.b
    };
    const h = layoutText({
      ...input,
      body: {
        ...body,
        vert: void 0,
        // Swapped so the recursive avail dims equal the real box's cross dims:
        // layout width = boxH - t - b, layout height = boxW - l - r
        insets: { l: ins.t, r: ins.b, t: ins.l, b: ins.r }
      },
      boxWidthPx: boxHeightPx,
      boxHeightPx: boxWidthPx
    });
    const realInsets = {
      l: emuToPx(ins.l, vp.scale),
      t: emuToPx(ins.t, vp.scale),
      r: emuToPx(ins.r, vp.scale),
      b: emuToPx(ins.b, vp.scale)
    };
    const wc = Math.max(boxWidthPx - realInsets.l - realInsets.r, 1);
    const hc = Math.max(boxHeightPx - realInsets.t - realInsets.b, 1);
    const lines = h.lines.map((ln) => ({
      ...ln,
      runs: ln.runs.map((r) => {
        const topOff = 0.8 * r.fontSizePx;
        return vert === "vert" ? { ...r, x: wc - (r.baselineY - topOff), baselineY: r.x + topOff, rotate90: true } : { ...r, x: r.baselineY - topOff, baselineY: hc - r.x + topOff, rotate270: true };
      })
    }));
    let contentHeight = 0;
    for (const ln of h.lines)
      for (const r of ln.runs) contentHeight = Math.max(contentHeight, r.x + r.widthPx);
    const { inkBottom: _layoutSpaceInk, ...rest } = h;
    return { ...rest, lines, insets: realInsets, vert, contentHeight };
  }
  function layoutTextVertical(body, vert, availWidth, availHeight, insets, wrap, metrics, scale2) {
    const fontScale = body.autofit === "shrink" ? body.fontScale ?? 1 : 1;
    const cols = [];
    const autoNum = new AutoNumCounter();
    for (const p of body.paragraphs) {
      const paraCols = [];
      let cur = [];
      let curH = 0;
      let agg = { ascent: 0, descent: 0, size: 0 };
      const finishCol = (soft) => {
        let size = agg.size;
        if (!cur.length)
          size = ptToPx(
            fontScale !== 1 ? Math.max(1, Math.round(DEFAULT_SIZE_PT * fontScale)) : DEFAULT_SIZE_PT,
            scale2
          );
        paraCols.push({
          runs: cur,
          usedH: curH,
          // Line height maps to column width: 1.2em of the column's max font size × the paragraph line-spacing setting
          colW: lineH(p, size, scale2, 0),
          paraStart: false,
          ...soft != null ? { softBreakAfter: soft } : {},
          gapBefore: 0,
          gapAfter: 0
        });
        cur = [];
        curH = 0;
        agg = { ascent: 0, descent: 0, size: 0 };
      };
      const pushCell = (tok, g, isBullet = false, numType, startAt) => {
        const m = metrics.metrics(tok.style);
        const adv = m.ascent + m.descent + tok.ls;
        if (wrap && cur.length && curH + adv > availHeight) finishCol();
        agg = {
          ascent: Math.max(agg.ascent, m.ascent),
          descent: Math.max(agg.descent, m.descent),
          size: Math.max(agg.size, tok.style.fontSizePx)
        };
        cur.push({
          text: g,
          x: 0,
          baselineY: curH + m.ascent,
          fontFamily: metrics.displayFamily?.(tok.style, g) ?? tok.style.fontFamily,
          ...tok.srcFont ? { srcFontFamily: tok.srcFont } : {},
          fontSizePx: tok.style.fontSizePx,
          color: tok.color,
          bold: tok.style.bold,
          italic: tok.style.italic,
          underline: tok.underline,
          ...tok.strike ? { strike: true } : {},
          ...tok.highlight ? { highlight: tok.highlight } : {},
          ...tok.outline ? { outline: tok.outline } : {},
          ...tok.gradient ? { gradient: tok.gradient } : {},
          ...tok.glow ? { glow: tok.glow } : {},
          ...tok.reflection ? { reflection: true } : {},
          ...tok.shadow ? { shadow: tok.shadow } : {},
          widthPx: metrics.measure(g, tok.style),
          ...tok.blPct ? { baselinePct: tok.blPct } : {},
          ...isBullet ? { isBullet: true } : { srcRunIdx: tok.srcRun },
          ...numType ? { numType } : {},
          ...numType && startAt != null ? { startAt } : {},
          ...!isBullet && tok.link ? { link: tok.link } : {},
          ascentPx: m.ascent
        });
        curH += adv;
      };
      const pushRotated = (tok) => {
        const m = metrics.metrics(tok.style);
        const adv = tokenWidth(tok, metrics);
        if (wrap && cur.length && curH + adv > availHeight) finishCol();
        agg = {
          ascent: Math.max(agg.ascent, m.ascent),
          descent: Math.max(agg.descent, m.descent),
          size: Math.max(agg.size, tok.style.fontSizePx)
        };
        cur.push({
          text: tok.text,
          x: 0,
          baselineY: curH + m.ascent,
          fontFamily: metrics.displayFamily?.(tok.style, tok.text) ?? tok.style.fontFamily,
          ...tok.srcFont ? { srcFontFamily: tok.srcFont } : {},
          fontSizePx: tok.style.fontSizePx,
          color: tok.color,
          bold: tok.style.bold,
          italic: tok.style.italic,
          underline: tok.underline,
          ...tok.strike ? { strike: true } : {},
          ...tok.highlight ? { highlight: tok.highlight } : {},
          ...tok.outline ? { outline: tok.outline } : {},
          ...tok.gradient ? { gradient: tok.gradient } : {},
          ...tok.glow ? { glow: tok.glow } : {},
          ...tok.reflection ? { reflection: true } : {},
          ...tok.shadow ? { shadow: tok.shadow } : {},
          widthPx: adv,
          // Rotated Latin words draw as whole strings too: keep draw kerning in step with the measure
          ...tok.style.kerning === false ? { kerningOff: true } : {},
          rotate90: true,
          srcRunIdx: tok.srcRun,
          ...tok.link ? { link: tok.link } : {},
          ascentPx: m.ascent
        });
        curH += adv;
      };
      const hasText = p.runs.some((r) => r.text.trim());
      const bulletType = p.bullet?.type;
      const hasBullet = hasText && isBulletKind(bulletType);
      const num = autoNum.next(p, hasText);
      if (hasBullet && p.runs[0]) {
        const base = runStyle(p.runs[0], scale2, fontScale);
        let st = bulletRunStyle(base, p.bullet, scale2, fontScale);
        let glyph = bulletType === "number" ? formatAutoNum(num ?? 1, p.bullet?.numType) : p.bullet?.char ?? "\u2022";
        const sym = bulletType === "char" ? symbolBulletText(p.bullet?.font, glyph) : void 0;
        if (sym) {
          glyph = sym;
          st = { ...st, fontFamily: p.bullet.font };
        }
        pushCell(
          {
            text: "",
            style: st,
            color: p.bullet?.color ?? p.runs[0].color ?? "#000000",
            underline: false,
            ls: 0,
            breakable: false,
            isSpace: false,
            srcRun: 0
          },
          glyph,
          true,
          bulletType === "number" ? p.bullet?.numType ?? "arabicPeriod" : void 0,
          bulletType === "number" ? p.bullet?.startAt : void 0
        );
      }
      for (const rawTok of tokenizeParagraph(p, scale2, fontScale)) {
        const tok = substituteStyle(rawTok, metrics);
        if (tok.isBreak) {
          finishCol(tok.srcRun);
          continue;
        }
        const hasWide = [...tok.text].some((ch) => isWideChar(ch.codePointAt(0) ?? 0));
        if (vert !== "wordArtVert" && !hasWide && tok.text.trim()) {
          pushRotated(tok);
          continue;
        }
        for (const g of graphemes(tok.text)) pushCell(tok, g);
      }
      if (cur.length || !paraCols.length) finishCol();
      paraCols[0].paraStart = true;
      const singleW = paraCols[0].colW;
      paraCols[0].gapBefore = ptToPx(p.spaceBefore ?? 0, scale2) + (p.spaceBeforePct ? singleW * (p.spaceBeforePct / 100) : 0);
      paraCols[paraCols.length - 1].gapAfter = ptToPx(p.spaceAfter ?? 0, scale2) + (p.spaceAfterPct ? singleW * (p.spaceAfterPct / 100) : 0);
      if (p.align) {
        for (const c of paraCols) {
          c.align = p.align;
          c.alignExplicit = true;
        }
      }
      if (paraBaseRtl(p)) for (const c of paraCols) c.rtl = true;
      cols.push(...paraCols);
    }
    const ltr = vert === "wordArtVert";
    const contentW = cols.reduce((a, c) => a + c.gapBefore + c.colW + c.gapAfter, 0);
    const anchor = body.anchor ?? "top";
    const extraW = availWidth - contentW;
    const anchorOff = anchor === "middle" ? extraW / 2 : anchor === "bottom" ? extraW : 0;
    let xFlow = ltr ? anchorOff : availWidth - anchorOff;
    let contentHeight = 0;
    const lines = cols.map((c) => {
      let colX;
      if (ltr) {
        xFlow += c.gapBefore;
        colX = xFlow;
        xFlow = colX + c.colW + c.gapAfter;
      } else {
        xFlow -= c.gapBefore;
        colX = xFlow - c.colW;
        xFlow = colX - c.gapAfter;
      }
      const dy = c.align === "center" ? (availHeight - c.usedH) / 2 : c.align === "right" ? availHeight - c.usedH : 0;
      contentHeight = Math.max(contentHeight, dy + c.usedH);
      return {
        runs: c.runs.map((r) => ({
          ...r,
          // Rotated word anchor = column center shifted right by half the font size (after 90° clockwise the text box lands back on the column center)
          x: r.rotate90 ? colX + (c.colW + r.fontSizePx) / 2 : colX + (c.colW - r.widthPx) / 2,
          baselineY: r.baselineY + dy
        })),
        top: dy,
        height: c.usedH,
        paraStart: c.paraStart,
        ...c.softBreakAfter != null ? { softBreakAfter: c.softBreakAfter } : {},
        ...c.alignExplicit && c.align ? { align: c.align } : {},
        ...c.rtl ? { rtl: true } : {}
      };
    });
    return { lines, insets, anchor, fontScale, contentHeight, wrap, vert };
  }
  function alignOffset(align, availWidth, lineWidth) {
    if (align === "center") return (availWidth - lineWidth) / 2;
    if (align === "right") return availWidth - lineWidth;
    return 0;
  }
  function layoutAll(body, availWidth, wrap, metrics, scale2, fontScale, lnSpcRed, trimEdgeSpacing, media) {
    const outLines = [];
    let inkBottom = 0;
    let y = 0;
    const autoNum = new AutoNumCounter();
    for (const [pIdx, p] of body.paragraphs.entries()) {
      const marLPx = emuToPx(p.marL ?? (p.level ? p.level * 457200 : 0), scale2);
      const indentPx = emuToPx(p.indent ?? 0, scale2);
      const hasText = p.runs.some((r) => r.text.trim());
      const bulletType = p.bullet?.type;
      const hasBullet = hasText && isBulletKind(bulletType);
      const num = autoNum.next(p, hasText);
      const bulletImage = hasBullet && bulletType === "blip" && p.bullet?.mediaRef ? media?.(p.bullet.mediaRef) : void 0;
      let bulletText = bulletType === "number" ? formatAutoNum(num ?? 1, p.bullet?.numType) : bulletImage ? "" : p.bullet?.char ?? "\u2022";
      const symText = bulletType === "char" ? symbolBulletText(p.bullet?.font, bulletText) : void 0;
      if (symText) bulletText = symText;
      const textX = marLPx;
      const marRPx = emuToPx(p.marR ?? 0, scale2);
      const avail = Math.max(availWidth - textX - marRPx, 1);
      const mirror = paraBaseRtl(p);
      const align = p.align ?? (mirror ? "right" : void 0);
      let bulletSt;
      let bulletW = 0;
      let bulletImgH = 0;
      if (hasBullet) {
        bulletSt = bulletRunStyle(runStyle(p.runs[0], scale2, fontScale), p.bullet, scale2, fontScale);
        if (symText) bulletSt = { ...bulletSt, fontFamily: p.bullet.font };
        if (bulletImage) {
          bulletImgH = bulletSt.fontSizePx * 0.75;
          bulletW = bulletImgH * imageAspect(bulletImage);
        } else bulletW = metrics.measure(bulletText, bulletSt);
      }
      const bulletX = Math.max(marLPx + indentPx, 0);
      const bulletOverflowPx = hasBullet ? Math.max(bulletX + bulletW - textX, 0) : 0;
      const firstLineDx = hasBullet ? bulletOverflowPx : Math.max(indentPx, -marLPx);
      const laid = layoutParagraph(p, avail, wrap, metrics, scale2, fontScale, lnSpcRed, firstLineDx, {
        stopsPx: (p.tabStops ?? []).map((t) => emuToPx(t.pos, scale2)),
        defaultPx: Math.max(emuToPx(p.defTabSz ?? 914400, scale2), 1),
        originPx: textX
      });
      const singleH = laid[0]?.singleH ?? 0;
      if (pIdx !== 0)
        y += ptToPx(p.spaceBefore ?? 0, scale2) + (p.spaceBeforePct ? singleH * (p.spaceBeforePct / 100) : 0);
      laid.forEach((ln, li) => {
        const baseline = y + (ln.leadAbove ?? 0) + ln.ascent;
        inkBottom = Math.max(inkBottom, baseline + ln.descent);
        const lineWidth = ln.runs.reduce((acc, r) => acc + r.widthPx, 0);
        const firstShift = !hasBullet && li === 0 ? firstLineDx : 0;
        const bulletShift = li === 0 ? bulletOverflowPx : 0;
        let lineRuns = ln.runs;
        if (align === "justify" && wrap && li < laid.length - 1 && ln.softBreakAfter == null && ln.runs.length) {
          const extra = avail - firstShift - bulletShift - lineWidth;
          const last = ln.runs.length - 1;
          const spaceCount = ln.runs.reduce(
            (acc, r, i) => acc + ((i === last ? r.text.replace(/ +$/, "") : r.text).match(/ /g)?.length ?? 0),
            0
          );
          if (extra > 0 && spaceCount > 0 && !ln.runs.some((r) => r.rtl)) {
            const per = extra / spaceCount;
            let remaining = spaceCount;
            let shift = 0;
            lineRuns = ln.runs.flatMap((r) => {
              if (remaining <= 0 || !r.text.includes(" ")) return [{ ...r, x: r.x + shift }];
              const style = {
                fontFamily: r.fontFamily,
                fontSizePx: r.fontSizePx,
                bold: r.bold,
                italic: r.italic
              };
              const ls = r.letterSpacingPx ?? 0;
              const frags = r.text.match(/[^ ]+ *| +/g) ?? [r.text];
              const widths = frags.map((f) => metrics.measure(f, style) + ls * [...f].length);
              const wSum = widths.reduce((a, b) => a + b, 0);
              const norm = wSum > 0 ? r.widthPx / wSum : 1;
              let fx = r.x + shift;
              return frags.map((f, i) => {
                const natural = widths[i] * norm;
                const nSp = Math.min(/ +$/.exec(f)?.[0].length ?? 0, remaining);
                remaining -= nSp;
                const frag = { ...r, text: f, x: fx, widthPx: natural + nSp * per };
                fx += natural + nSp * per;
                shift += nSp * per;
                return frag;
              });
            });
          } else {
            const totalChars = ln.runs.reduce((acc, r) => acc + [...r.text].length, 0);
            if (totalChars > 1 && extra > 0) {
              const per = extra / (totalChars - 1);
              let consumed = 0;
              lineRuns = ln.runs.map((r) => {
                const chars = [...r.text].length;
                const jr = {
                  ...r,
                  x: r.x + consumed * per,
                  widthPx: r.widthPx + chars * per,
                  justifyExtraPx: per
                };
                consumed += chars;
                return jr;
              });
            }
          }
        }
        const off = alignOffset(align, avail, lineWidth + bulletShift);
        let dx = textX + firstShift + bulletShift + off;
        const rightEdge = availWidth - textX - firstShift - bulletShift;
        const mirrorSpread = mirror && align === "justify" && lineRuns !== ln.runs;
        if (mirror) {
          dx = mirrorSpread || align === "left" ? marRPx : align === "center" ? marRPx + (rightEdge - marRPx - lineWidth) / 2 : rightEdge - lineWidth;
        }
        const runs = lineRuns.map((r) => ({
          ...r,
          x: r.x + dx,
          baselineY: baseline - (r.baselineShiftPx ?? 0)
        }));
        if (hasBullet && li === 0) {
          const st = bulletSt;
          const bx = mirror ? dx + (mirrorSpread ? rightEdge : lineWidth) + (textX + bulletShift - bulletX - bulletW) : bulletX + off;
          runs.unshift({
            text: bulletText,
            x: bx,
            ...mirror ? { rtl: true } : {},
            baselineY: baseline,
            fontFamily: metrics.displayFamily?.(st, bulletText) ?? st.fontFamily,
            fontSizePx: st.fontSizePx,
            color: p.bullet?.color ?? p.runs[0]?.color ?? "#000000",
            bold: st.bold,
            italic: false,
            underline: false,
            widthPx: bulletW,
            isBullet: true,
            ...bulletType === "number" ? { numType: p.bullet?.numType ?? "arabicPeriod" } : {},
            ...bulletType === "number" && p.bullet?.startAt != null ? { startAt: p.bullet.startAt } : {},
            ...bulletImage ? { image: bulletImage } : {},
            ascentPx: bulletImage ? bulletImgH : metrics.metrics(st).ascent
          });
        }
        outLines.push({
          runs,
          top: y,
          height: ln.height,
          ...ln.leadAbove ? { leadAbove: ln.leadAbove } : {},
          paraStart: li === 0,
          ...ln.trailingSpace ? { trailingSpace: true } : {},
          ...ln.trailingText ? { trailingText: ln.trailingText } : {},
          ...ln.softBreakAfter != null ? { softBreakAfter: ln.softBreakAfter } : {},
          ...p.align ? { align: p.align } : {},
          ...paraBaseRtl(p) ? { rtl: true } : {},
          ...p.level ? { level: p.level } : {},
          ...marLPx ? { marLPx } : {},
          ...indentPx ? { indentPx } : {}
        });
        y += ln.height;
      });
      if (!(trimEdgeSpacing && pIdx === body.paragraphs.length - 1))
        y += ptToPx(p.spaceAfter ?? 0, scale2) + (p.spaceAfterPct ? singleH * (p.spaceAfterPct / 100) : 0);
    }
    return { lines: outLines, contentHeight: y, inkBottom };
  }

  // ../../../tmp/genoffice/packages/pptx-engine/src/table-grid.ts
  function tableRowGridCols2(row) {
    const cols = [];
    let c = 0;
    row.forEach((cell, i) => {
      cols.push(c);
      const span = cell.gridSpan ?? 1;
      const followers = span > 1 ? row.slice(i + 1, i + span) : [];
      c += followers.length === span - 1 && followers.every((f) => f.merged) ? 1 : span;
    });
    return cols;
  }

  // ../../../tmp/genoffice/packages/pptx-engine/src/identity.ts
  var CREATION_ID_RE = /<a16:creationId[^>]*\bid="\{?([0-9A-Fa-f-]{36})\}?"/;
  function elementDurableId2(el) {
    const xml = el.anchor?.originalXml;
    if (!xml) {
      const nvId = el.nvId;
      return nvId != null ? `e_${nvId}` : null;
    }
    const open = /<p:cNvPr\b[^>]*?(\/?)>/.exec(xml);
    if (!open) return null;
    const own = open[1] === "/" ? open[0] : xml.slice(open.index, xml.indexOf("</p:cNvPr>", open.index) + "</p:cNvPr>".length);
    const creation = CREATION_ID_RE.exec(own);
    if (creation) return `e_${creation[1].slice(0, 8).toLowerCase()}`;
    const cnvpr = /\bid="(\d+)"/.exec(open[0]);
    return cnvpr ? `e_${cnvpr[1]}` : null;
  }
  function groupChildDurableId2(grp, child) {
    const nvId = child.nvId;
    const xml = grp.anchor?.originalXml;
    if (xml && nvId != null) {
      const open = new RegExp(`<p:cNvPr\\b[^>]*\\bid="${nvId}"[^>]*?(\\/?)>`).exec(xml);
      if (open) {
        const own = open[1] === "/" ? open[0] : xml.slice(open.index, xml.indexOf("</p:cNvPr>", open.index) + "</p:cNvPr>".length);
        const creation = CREATION_ID_RE.exec(own);
        if (creation) return `e_${creation[1].slice(0, 8).toLowerCase()}`;
      }
    }
    return elementDurableId2(child);
  }

  // ../../../tmp/genoffice/packages/pptx-engine/src/background-promote.ts
  var EMU_PER_PX2 = 9525;
  var COVER_TOL2 = 2 * EMU_PER_PX2;
  function coversPage(t, size, maxAreaRatio) {
    const o = t.offset;
    return o.x <= COVER_TOL2 && o.y <= COVER_TOL2 && o.x + o.cx >= size.cx - COVER_TOL2 && o.y + o.cy >= size.cy - COVER_TOL2 && o.cx * o.cy <= size.cx * size.cy * maxAreaRatio;
  }
  function strokeInvisible(stroke) {
    if (!stroke || stroke.width === 0 || stroke.fill.type === "none") return true;
    return stroke.fill.type === "solid" && (stroke.fill.color === "none" || /^#?[0-9a-fA-F]{6}00$/.test(stroke.fill.color));
  }
  function hasVisibleText(el) {
    return !!el.text?.paragraphs.some((p) => p.runs.some((r) => r.text.trim() !== ""));
  }
  function isBackgroundLikeElement2(el, size) {
    if (el.placeholder || el.transform.rot !== 0) return false;
    if (!coversPage(el.transform, size, 1.5)) return false;
    if (el.type === "picture") {
      const p = el;
      return !p.media && strokeInvisible(p.stroke);
    }
    if (el.type !== "shape" && el.type !== "text") return false;
    const t = el;
    const fillKind = t.fill?.type;
    return (fillKind === "solid" || fillKind === "gradient" || fillKind === "image") && (t.presetGeometry ?? "rect") === "rect" && !t.customGeometry && strokeInvisible(t.stroke) && !hasVisibleText(t);
  }

  // ../genoffice/packages/pptx-render/src/build-chart.ts
  var PALETTE = ["#4472C4", "#ED7D31", "#A5A5A5", "#FFC000", "#5B9BD5", "#70AD47"];
  function arrayMax(values, initial = -Infinity) {
    let result = initial;
    for (const value of values) result = Math.max(result, value);
    return result;
  }
  function arrayMin(values, initial = Infinity) {
    let result = initial;
    for (const value of values) result = Math.min(result, value);
    return result;
  }
  var LABEL_FONT = "Calibri";
  function gridDefaults(model) {
    return model.hasStylePart ? { major: "#E6E6E6" } : { major: "#868686", minor: "#B7B7B7" };
  }
  function majorGridColor(ax, model) {
    if (!ax?.gridColor) return void 0;
    return ax.gridColorAuto ? gridDefaults(model).major : ax.gridColor;
  }
  function minorGridColor(ax, model) {
    return ax?.minorGridColor ?? (ax?.minorGridAuto ? gridDefaults(model).minor : void 0);
  }
  function chartPalette(model) {
    return model.themePalette?.length ? model.themePalette : PALETTE;
  }
  function chartTextPt(model) {
    return model.defaultTextPt ?? 10;
  }
  function chartFont(model) {
    return model.fontFamily ?? LABEL_FONT;
  }
  function chartLabelDefault(model) {
    return model.defaultTextColor ?? (model.hasStylePart ? "#666666" : "#000000");
  }
  function defaultLineWidthPx(model, scale2) {
    return Math.max(1.5, ptToPx(model.hasStylePart ? 1.5 : 2.25, scale2));
  }
  function shade2(color, f) {
    const m = /^#([0-9a-f]{6})$/i.exec(color);
    if (!m) return color;
    const ch = (i) => Math.min(255, Math.round(parseInt(m[1].slice(i, i + 2), 16) * f)).toString(16).padStart(2, "0");
    return `#${ch(0)}${ch(2)}${ch(4)}`;
  }
  function barFaces(x, y, w, h, d, color) {
    const top = `M ${x} ${y} L ${x + w} ${y} L ${x + w + d} ${y - d} L ${x + d} ${y - d} Z`;
    const side = `M ${x + w} ${y} L ${x + w + d} ${y - d} L ${x + w + d} ${y + h - d} L ${x + w} ${y + h} Z`;
    return [
      { d: top, fill: shade2(color, 1.18) },
      { d: side, fill: shade2(color, 0.78) }
    ];
  }
  function dashArray(val, widthPx) {
    const u = Math.max(widthPx, 1);
    switch (val) {
      case "dot":
        return [u, 3 * u];
      case "sysDot":
        return [u, u];
      case "sysDash":
        return [3 * u, u];
      case "lgDash":
        return [8 * u, 3 * u];
      case "dashDot":
        return [4 * u, 3 * u, u, 3 * u];
      case "lgDashDot":
        return [8 * u, 3 * u, u, 3 * u];
      case "lgDashDotDot":
        return [8 * u, 3 * u, u, 3 * u, u, 3 * u];
      case "sysDashDot":
        return [3 * u, u, u, u];
      case "sysDashDotDot":
        return [3 * u, u, u, u, u, u];
      default:
        return [4 * u, 3 * u];
    }
  }
  function buildChartNode(id, sourceId, model, box, vp, metrics, media) {
    const node = buildChartNodeTitled(id, sourceId, model, box, vp, metrics, media);
    if (node && model.fontFamily) for (const l of node.labels) l.fontFamily ??= model.fontFamily;
    return node;
  }
  function buildChartNodeTitled(id, sourceId, model, box, vp, metrics, media) {
    if (!model.title) {
      const node2 = buildChartNodeInner(id, sourceId, model, box, vp, metrics, media);
      if (node2) extrudeBars(node2, model);
      return node2;
    }
    const titleSizePx = ptToPx(model.titlePt ?? chartTextPt(model) * 1.2, vp.scale);
    const titleBold = model.titleBold ?? true;
    const measureTitle = (t) => metrics.measure(t, {
      fontFamily: chartFont(model),
      fontSizePx: titleSizePx,
      bold: titleBold,
      italic: !!model.titleItalic
    });
    const titleLines = wrapToWidth(model.title, Math.max(box.w - 16, 40), measureTitle);
    const titleH = titleSizePx * 1.4 * titleLines.length + titleSizePx * 0.3;
    const manual = !!model.plotLayout && (model.kind === "line" || model.kind === "area" || model.kind === "bar" || model.kind === "pie") || // <c:overlay val="1"/>: the title floats over the plot without reserving space
    !!model.titleOverlay;
    const node = buildChartNodeInner(
      id,
      sourceId,
      model,
      manual ? box : { ...box, h: Math.max(box.h - titleH, 10) },
      vp,
      metrics,
      media
    );
    if (!node) return null;
    if (!manual) shiftChartNode(node, titleH);
    extrudeBars(node, model);
    node.box = box;
    titleLines.forEach((line2, i) => {
      node.labels.push({
        text: line2,
        x: Math.max((box.w - measureTitle(line2)) / 2, 4),
        y: titleSizePx * 0.3 + i * titleSizePx * 1.4,
        fontSizePx: titleSizePx,
        color: model.titleColor ?? model.defaultTextColor ?? (model.hasStylePart ? "#333333" : "#000000"),
        bold: titleBold,
        ...model.titleItalic ? { italic: true } : {}
      });
    });
    return node;
  }
  function wrapToWidth(text, maxW, measure) {
    if (measure(text) <= maxW) return [text];
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = "";
    for (const w of words) {
      const cand = cur ? `${cur} ${w}` : w;
      if (cur && measure(cand) > maxW) {
        lines.push(cur);
        cur = w;
      } else {
        cur = cand;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }
  function extrudeBars(node, model) {
    if (!model.pseudo3D || !node.bars.length) return;
    const faces = [];
    for (const b of node.bars) {
      const d = Math.min(Math.max(Math.min(b.w, b.h) * 0.35, 3), 14);
      faces.push(...barFaces(b.x, b.y, b.w, b.h, d, b.color));
    }
    node.paths = [...faces, ...node.paths ?? []];
  }
  function shiftChartNode(node, dy) {
    for (const g of node.gridLines) {
      g.y1 += dy;
      g.y2 += dy;
    }
    for (const a of node.axisLines) {
      a.y1 += dy;
      a.y2 += dy;
    }
    for (const l of node.labels) l.y += dy;
    for (const b of node.bars) b.y += dy;
    for (const p of node.polylines)
      for (let i = 1; i < p.points.length; i += 2) p.points[i] = p.points[i] + dy;
    for (const m of node.markers) m.y += dy;
    for (const s of node.swatches) s.y += dy;
    for (const w of node.wedges ?? []) w.cy += dy;
    for (const p of node.paths ?? []) p.dy = (p.dy ?? 0) + dy;
    if (node.plotRect) node.plotRect.y += dy;
  }
  function pointFillResolver(vp, media) {
    return (f) => {
      if (!f) return {};
      const rf = resolveFill(f, vp, media);
      return rf.kind === "none" ? {} : { fill: rf };
    };
  }
  function buildChartNodeInner(id, sourceId, model, box, vp, metrics, media) {
    if (model.kind === "pie") return buildPieNode(id, sourceId, model, box, vp, metrics);
    if (model.kind === "scatter") return buildScatterNode(id, sourceId, model, box, vp, metrics);
    if (model.kind === "radar") return buildRadarNode(id, sourceId, model, box, vp, metrics);
    if (model.kind === "funnel") return buildFunnelNode(id, sourceId, model, box, vp, metrics);
    if (model.kind === "sunburst") return buildSunburstNode(id, sourceId, model, box, vp, metrics);
    if (model.kind === "bar" && model.barDir === "bar") {
      return buildHBarNode(id, sourceId, model, box, vp, metrics, media);
    }
    if (model.kind === "bar" && model.bar3D && ["standard", "clustered"].includes(model.grouping ?? "clustered") && model.series.every((s) => !s.plotKind || s.plotKind === "bar")) {
      const b3 = buildBar3DNode(id, sourceId, model, box, vp, metrics);
      if (b3) return b3;
    }
    if (model.kind === "area" && model.area3D && model.series.every((s) => !s.plotKind || s.plotKind === "area")) {
      const a3 = buildArea3DNode(id, sourceId, model, box, vp, metrics);
      if (a3) return a3;
    }
    if (model.kind !== "line" && model.kind !== "bar" && model.kind !== "area") return null;
    const grouping = model.kind === "bar" ? model.grouping ?? "clustered" : model.grouping ?? "standard";
    const stacked = grouping === "stacked" || grouping === "percentStacked";
    const serKind = (ser) => ser.plotKind ?? model.kind;
    const barSeriesIdx = model.series.map((s, i) => i).filter((i) => serKind(model.series[i]) === "bar");
    const numVals = (s) => s.values.filter((v) => v != null);
    let secVals = model.series.filter((s) => s.secondaryAxis && serKind(s) !== "bar").flatMap(numVals);
    let priVals = model.series.filter((s) => !(s.secondaryAxis && serKind(s) !== "bar")).flatMap(numVals);
    if (!priVals.length) {
      priVals = secVals;
      secVals = [];
    }
    const onSecAxis = (ser) => secVals.length > 0 && !!ser.secondaryAxis && serKind(ser) !== "bar";
    const node = {
      id,
      type: "chart",
      box,
      sourceId,
      gridLines: [],
      axisLines: [],
      labels: [],
      bars: [],
      polylines: [],
      markers: [],
      swatches: []
    };
    const labelSizePx = ptToPx(model.valAxis?.labelSizePt ?? chartTextPt(model), vp.scale);
    const labelColor = model.valAxis?.labelColor ?? chartLabelDefault(model);
    const catLabelSizePx = ptToPx(
      model.catAxis?.labelSizePt ?? model.valAxis?.labelSizePt ?? chartTextPt(model),
      vp.scale
    );
    const catLabelColor = model.catAxis?.labelColor ?? labelColor;
    const style = (sizePx) => ({
      fontFamily: chartFont(model),
      fontSizePx: sizePx,
      bold: false,
      italic: false
    });
    const measure = (text, sizePx) => metrics.measure(text, style(sizePx));
    const palette = chartPalette(model);
    const seriesColor = (i) => model.series[i]?.color ?? palette[(model.series[i]?.paletteIdx ?? i) % palette.length];
    const pointFill = pointFillResolver(vp, media);
    if (!priVals.length) return null;
    const catCount = arrayMax(
      model.series.map((s) => s.values.length),
      Math.max(model.categories.length, 1)
    );
    const isStackSer = (s) => {
      const k = serKind(s);
      return k === "bar" || k === "area" || model.kind === "line" && k === "line";
    };
    const catAbsTotals = Array.from(
      { length: catCount },
      (_, i) => model.series.reduce((a, s) => a + (isStackSer(s) ? Math.abs(s.values[i] ?? 0) : 0), 0)
    );
    const valueAt = (si, i) => {
      const v = model.series[si]?.values[i];
      if (v == null) return null;
      if (grouping !== "percentStacked" || !isStackSer(model.series[si])) return v;
      const total = catAbsTotals[i] || 1;
      return v / total * 100;
    };
    let dataMax;
    let dataMin;
    if (stacked) {
      const stackIdx = model.series.map((s, i) => isStackSer(s) ? i : -1).filter((i) => i >= 0);
      const posSums = Array.from(
        { length: catCount },
        (_, i) => stackIdx.reduce((a, si) => a + Math.max(valueAt(si, i) ?? 0, 0), 0)
      );
      const negSums = Array.from(
        { length: catCount },
        (_, i) => stackIdx.reduce((a, si) => a + Math.min(valueAt(si, i) ?? 0, 0), 0)
      );
      const overlayVals = model.series.filter((s) => !isStackSer(s) && !onSecAxis(s)).flatMap(numVals);
      dataMax = arrayMax(overlayVals, arrayMax(posSums, 0));
      dataMin = arrayMin(overlayVals, arrayMin(negSums, 0));
    } else {
      dataMax = arrayMax(priVals, 0);
      dataMin = arrayMin(priVals, 0);
    }
    if (grouping === "percentStacked") {
      dataMax = 100;
      dataMin = dataMin < 0 ? -100 : 0;
    }
    const maxIntervals = Math.max(3, Math.min(10, Math.floor(box.h / (labelSizePx * 1.75))));
    const logBase = model.valAxis?.logBase;
    const { min, max, ticks } = logBase ? logTicks(
      arrayMin(priVals.filter((v) => v > 0)),
      dataMax,
      model.valAxis?.min,
      model.valAxis?.max,
      logBase
    ) : ppTicks(
      model.valAxis?.min ?? dataMin,
      model.valAxis?.max ?? dataMax,
      model.valAxis?.min == null && grouping !== "percentStacked",
      model.valAxis?.max == null && grouping !== "percentStacked",
      false,
      maxIntervals,
      false,
      model.valAxis?.majorUnit
    );
    const sec = secVals.length ? ppTicks(
      model.valAxis2?.min ?? arrayMin(secVals, 0),
      model.valAxis2?.max ?? arrayMax(secVals, 0),
      model.valAxis2?.min == null,
      model.valAxis2?.max == null,
      false,
      maxIntervals,
      false,
      model.valAxis2?.majorUnit
    ) : void 0;
    const pad = Math.max(4, box.w * 0.01);
    const legendPos = model.legendPos;
    const legendSizePx = ptToPx(
      model.legendPt ?? model.valAxis?.labelSizePt ?? chartTextPt(model),
      vp.scale
    );
    const legendBold = !!model.legendBold;
    const legendH = (legendPos === "t" || legendPos === "b") && !model.legendOverlay ? legendSizePx * 1.6 : 0;
    const legendItems = model.series.some((s) => s.name) ? model.series.map((s) => s.name ?? "") : [];
    const legendColW = legendItems.length && (legendPos === "r" || legendPos === "l" || legendPos === "tr") ? legendSizePx * 0.5 + 4 + Math.max(
      ...legendItems.map(
        (t) => metrics.measure(t, {
          fontFamily: chartFont(model),
          fontSizePx: legendSizePx,
          bold: legendBold,
          italic: false
        })
      ),
      0
    ) + 8 : 0;
    const legendW = model.legendOverlay ? 0 : legendColW;
    const valHidden = !!model.valAxis?.hidden;
    const valLabelsOff = valHidden || !!model.valAxis?.tickLblHidden || !!model.valAxis?.tickLblGarbage;
    const catLabelsOff = !!model.catAxis?.hidden || !!model.catAxis?.tickLblHidden || !!model.catAxis?.tickLblGarbage;
    const valNoReserve = valHidden || !!model.valAxis?.tickLblHidden;
    const catNoReserve = !!model.catAxis?.hidden || !!model.catAxis?.tickLblHidden;
    const tickLabels = ticks.map(
      (t) => grouping === "percentStacked" ? `${fmtNum(t)}%` : model.valAxis?.numFmt ? fmtDataLabel(t, model.valAxis.numFmt) : logBase ? String(t) : fmtNum(t)
    );
    const yLabelW = valNoReserve ? 0 : model.valAxis?.tickLblGarbage ? measure(fmtDataLabel(0, model.valAxis?.numFmt), labelSizePx) * 1.2 : arrayMax(
      tickLabels.map((t) => measure(t, labelSizePx)),
      0
    );
    const titleSizePxOf = (a, dflt) => a?.titleSizePt ? ptToPx(a.titleSizePt, vp.scale) : dflt;
    const measureAxisTitle = (a, sizePx) => metrics.measure(a?.title ?? "", {
      fontFamily: chartFont(model),
      fontSizePx: sizePx,
      bold: !!a?.titleBold,
      italic: !!a?.titleItalic
    });
    const valTitleSizePx = titleSizePxOf(model.valAxis, labelSizePx);
    const axisTitleW = model.valAxis?.title && !model.valAxis.titleOverlay ? valTitleSizePx * 1.2 + labelSizePx * 0.7 : 0;
    const secLabelSizePx = ptToPx(
      model.valAxis2?.labelSizePt ?? model.valAxis?.labelSizePt ?? chartTextPt(model),
      vp.scale
    );
    const secTickLabels = sec ? sec.ticks.map((t) => fmtNum(t)) : [];
    const y2LabelW = sec ? arrayMax(
      secTickLabels.map((t) => measure(t, secLabelSizePx)),
      0
    ) : 0;
    const valTitle2SizePx = titleSizePxOf(model.valAxis2, secLabelSizePx);
    const axisTitle2W = sec && model.valAxis2?.title && !model.valAxis2.titleOverlay ? valTitle2SizePx * 1.2 + secLabelSizePx * 0.7 : 0;
    const valLabelGap = valNoReserve ? 6 : labelSizePx * 0.95;
    const valRight = !model.pseudo3D && !sec && !!model.catAxis?.reversed !== (model.valAxis?.crosses === "max");
    const valSideW = axisTitleW + yLabelW + valLabelGap;
    const plotX = pad + (valRight ? labelSizePx * 0.7 : valSideW);
    const plotY = pad + (legendPos === "t" ? legendH + 4 : 0) + (valNoReserve ? 0 : labelSizePx * 0.6);
    const plotR = box.w - pad - (sec ? y2LabelW + axisTitle2W + 10 : valRight ? valSideW : labelSizePx * 0.7) - legendW;
    const nCats = Math.max(model.categories.length, 1);
    const maxCatW = arrayMax(
      model.categories.map((c) => measure(c, catLabelSizePx)),
      1
    );
    const lblSkip = model.catAxis?.tickLblSkip ?? 1;
    const heuristicSlotW = Math.max(plotR - plotX, 10) / nCats * lblSkip;
    const catRotDeg = model.catAxis?.labelRotDeg;
    const catWrapLines = (slotW2) => {
      if (model.categories.length < 2 || maxCatW <= slotW2 * 1.05) return null;
      const maxLineW = slotW2 * 0.95;
      const wrapped = model.categories.map(
        (c) => wrapToWidth(c, maxLineW, (t) => measure(t, catLabelSizePx))
      );
      const fits = wrapped.every(
        (ls) => ls.length <= 3 && ls.every((l) => measure(l, catLabelSizePx) <= slotW2 * 1.05)
      );
      return fits && wrapped.some((ls) => ls.length > 1) ? wrapped : null;
    };
    const heuristicWrap = catRotDeg == null ? catWrapLines(heuristicSlotW) : null;
    const rotFactor = model.catAxis?.isDate ? 1 : 1.3;
    const rotateCats = catRotDeg != null && catRotDeg !== 0 || catRotDeg == null && !heuristicWrap && model.categories.length > 1 && maxCatW > heuristicSlotW * rotFactor;
    const catRotUsed = catRotDeg != null && catRotDeg !== 0 ? catRotDeg : -45;
    const rotReserve = Math.abs(Math.sin(catRotUsed * Math.PI / 180));
    const rotReserveCos = Math.abs(Math.cos(catRotUsed * Math.PI / 180));
    const catReserve = rotateCats ? Math.min(maxCatW * rotReserve + catLabelSizePx * rotReserveCos, box.h * 0.35) + catLabelSizePx * 0.2 : catLabelSizePx * 0.75 + catLabelSizePx * 1.2 * (heuristicWrap ? arrayMax(heuristicWrap.map((l) => l.length)) : 1) + catLabelSizePx * 0.15;
    const catAtZero = min < 0 && max > 0 && model.catAxis?.tickLblPos !== "low" && !catNoReserve && !rotateCats && !model.categoryGroups && !model.plotLayout && !model.pseudo3D;
    const catTitleSizePx = titleSizePxOf(model.catAxis, catLabelSizePx);
    const catTitleH = model.catAxis?.title && !model.catAxis.titleOverlay ? catTitleSizePx * 1.2 + catLabelSizePx * 0.4 : 0;
    const catGroupH = model.categoryGroups && !catNoReserve ? catLabelSizePx * 1.5 : 0;
    const plotB = box.h - pad - (catNoReserve || catAtZero ? 0 : catReserve) - (catAtZero ? labelSizePx * 0.6 : 0) - catGroupH - catTitleH - (legendPos === "b" ? legendH : 0);
    const L2 = model.plotLayout;
    const plot = L2 ? {
      x: L2.x * box.w,
      y: L2.y * box.h,
      w: Math.max(L2.w * box.w, 10),
      h: Math.max(L2.h * box.h, 10)
    } : {
      x: plotX,
      y: plotY,
      w: Math.max(plotR - plotX, 10),
      h: Math.max(plotB - plotY, 10)
    };
    let depth3d = 0;
    if (model.pseudo3D && barSeriesIdx.length && model.kind === "bar") {
      const barW0 = plot.w / Math.max(model.categories.length, 1) / ((stacked ? 1 : Math.max(barSeriesIdx.length, 1)) + (model.gapWidthPct ?? 150) / 100);
      depth3d = Math.min(barW0 * 0.8, plot.w * 0.06, plot.h * 0.15);
      plot.x += depth3d;
      plot.y += depth3d;
      plot.w -= depth3d * 3;
      plot.h -= depth3d;
    }
    const rev = !!model.valAxis?.reversed;
    const yOf = (v) => {
      const f = logBase ? (Math.log(Math.max(v, min)) - Math.log(min)) / (Math.log(max) - Math.log(min) || 1) : (v - min) / (max - min || 1);
      return plot.y + plot.h * (rev ? f : 1 - f);
    };
    const rev2 = !!model.valAxis2?.reversed;
    const yOf2 = (v) => {
      const f = (v - (sec?.min ?? 0)) / ((sec?.max ?? 1) - (sec?.min ?? 0) || 1);
      return plot.y + plot.h * (rev2 ? f : 1 - f);
    };
    if (model.plotFill || model.plotBorder) {
      node.plotRect = {
        x: plot.x + depth3d * 0.5,
        y: plot.y - depth3d,
        w: plot.w,
        h: plot.h,
        ...model.plotBorder ? {
          borderColor: model.plotBorder.color,
          borderWidthPx: Math.max(emuToPx(model.plotBorder.widthEmu, vp.scale), 0.75)
        } : {}
      };
    }
    const gridColor = majorGridColor(model.valAxis, model);
    const gridW = model.valAxis?.gridWidthEmu ? Math.max(emuToPx(model.valAxis.gridWidthEmu, vp.scale), 0.75) : void 0;
    const minorColor = minorGridColor(model.valAxis, model);
    const minorW = model.valAxis?.minorGridWidthEmu ? Math.max(emuToPx(model.valAxis.minorGridWidthEmu, vp.scale), 0.75) : void 0;
    const majorStep = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : 1;
    const explicitMinor = model.valAxis?.minorUnit && (max - min) / model.valAxis.minorUnit <= 200 ? model.valAxis.minorUnit : void 0;
    const minorStep = explicitMinor ?? majorStep / 5;
    const gxa = plot.x + depth3d * 0.5;
    if (minorColor) {
      const onMajor = (v) => {
        const r = Math.abs(v - min) % majorStep;
        return Math.min(r, majorStep - r) < minorStep * 1e-3;
      };
      const minors = [];
      if (logBase) minors.push(...logMinors(min, max, logBase));
      else
        for (let k = 1; min + k * minorStep <= max - minorStep * 1e-6; k++) {
          const v = min + k * minorStep;
          if (!onMajor(v)) minors.push(v);
        }
      for (const v of minors) {
        const my = yOf(v) - depth3d;
        node.gridLines.push({
          x1: gxa,
          y1: my,
          x2: gxa + plot.w,
          y2: my,
          color: minorColor,
          ...minorW ? { widthPx: minorW } : {}
        });
      }
    }
    for (let i = 0; i < ticks.length; i++) {
      const t = ticks[i];
      const y = yOf(t) - depth3d;
      if (gridColor) {
        node.gridLines.push({
          x1: gxa,
          y1: y,
          x2: gxa + plot.w,
          y2: y,
          color: gridColor,
          ...model.valAxis?.gridDash ? { dash: dashArray(model.valAxis?.gridDashVal, gridW ?? 1) } : {},
          ...gridW ? { widthPx: gridW } : {}
        });
      }
      if (valLabelsOff) continue;
      const text = tickLabels[i];
      node.labels.push({
        text,
        x: valRight ? plot.x + plot.w + valLabelGap : plot.x + depth3d * 0.5 - valLabelGap - measure(text, labelSizePx),
        y: y - labelSizePx * 0.55,
        fontSizePx: labelSizePx,
        color: labelColor,
        ...model.valAxis?.labelBold ? { bold: true } : {}
      });
    }
    const axisColor = model.valAxis?.lineColor ?? model.catAxis?.lineColor ?? "#888888";
    const axisW = Math.max(1, ptToPx(1, vp.scale));
    const crossY = depth3d ? plot.y + plot.h : yOf(Math.min(Math.max(0, min), max));
    node.axisLines.push({
      x1: plot.x,
      y1: crossY,
      x2: plot.x + plot.w,
      y2: crossY,
      color: axisColor,
      widthPx: axisW
    });
    const valAxisX = valRight ? plot.x + plot.w : plot.x + depth3d * 0.5;
    if (!valHidden)
      node.axisLines.push({
        x1: valAxisX,
        y1: plot.y - depth3d,
        x2: valAxisX,
        y2: plot.y - depth3d + plot.h,
        color: axisColor,
        widthPx: axisW
      });
    if (sec) {
      const secLabelColor = model.valAxis2?.labelColor ?? labelColor;
      node.axisLines.push({
        x1: plot.x + plot.w,
        y1: plot.y,
        x2: plot.x + plot.w,
        y2: plot.y + plot.h,
        color: model.valAxis2?.lineColor ?? axisColor,
        widthPx: axisW
      });
      sec.ticks.forEach((t, i) => {
        node.labels.push({
          text: secTickLabels[i],
          x: plot.x + plot.w + 6,
          y: yOf2(t) - secLabelSizePx * 0.55,
          fontSizePx: secLabelSizePx,
          color: secLabelColor
        });
      });
      if (model.valAxis2?.title) {
        const a = model.valAxis2;
        const sz = valTitle2SizePx;
        const tw = measureAxisTitle(a, sz);
        node.labels.push({
          text: a.title,
          x: box.w - pad,
          y: plot.y + plot.h / 2 - tw / 2,
          fontSizePx: sz,
          color: a.titleColor ?? secLabelColor,
          ...a.titleBold ? { bold: true } : {},
          ...a.titleItalic ? { italic: true } : {},
          rotationDeg: 90
        });
      }
    }
    if (model.catAxis?.title) {
      const a = model.catAxis;
      const sz = catTitleSizePx;
      const tw = measureAxisTitle(a, sz);
      node.labels.push({
        text: a.title,
        x: plot.x + (plot.w - tw) / 2,
        // Sits above a bottom legend (both were subtracted from the plot height)
        y: box.h - pad - (legendPos === "b" ? legendH : 0) - sz * 1.2,
        fontSizePx: sz,
        color: a.titleColor ?? a.labelColor ?? labelColor,
        ...a.titleBold ? { bold: true } : {},
        ...a.titleItalic ? { italic: true } : {}
      });
    }
    if (model.valAxis?.title) {
      const a = model.valAxis;
      const sz = valTitleSizePx;
      const tw = measureAxisTitle(a, sz);
      node.labels.push({
        text: a.title,
        x: valRight ? box.w - pad - legendW - sz * 1.2 : pad,
        y: plot.y + plot.h / 2 + tw / 2,
        fontSizePx: sz,
        color: a.titleColor ?? labelColor,
        ...a.titleBold ? { bold: true } : {},
        ...a.titleItalic ? { italic: true } : {},
        rotationDeg: -90
      });
    }
    const n = Math.max(model.categories.length, 1);
    const slotW = plot.w / n;
    const catSlot = model.catAxis?.reversed ? (i) => n - 1 - i : (i) => i;
    const catGrid = majorGridColor(model.catAxis, model);
    const catMinor = minorGridColor(model.catAxis, model);
    if (catGrid || catMinor) {
      const catW = model.catAxis?.gridWidthEmu ? Math.max(emuToPx(model.catAxis.gridWidthEmu, vp.scale), 0.75) : void 0;
      const catMinorW = model.catAxis?.minorGridWidthEmu ? Math.max(emuToPx(model.catAxis.minorGridWidthEmu, vp.scale), 0.75) : void 0;
      const gy = plot.y - depth3d;
      const markSkip = model.catAxis?.tickMarkSkip ?? 1;
      for (let i = 0; i <= n; i += markSkip) {
        const gx = plot.x + depth3d * 0.5 + i * slotW;
        if (catGrid && i > 0) {
          node.gridLines.push({
            x1: gx,
            y1: gy,
            x2: gx,
            y2: gy + plot.h,
            color: catGrid,
            ...model.catAxis?.gridDash ? { dash: dashArray(model.catAxis?.gridDashVal, catW ?? 1) } : {},
            ...catW ? { widthPx: catW } : {}
          });
        }
        if (catMinor && i < n) {
          node.gridLines.push({
            x1: gx + slotW / 2,
            y1: gy,
            x2: gx + slotW / 2,
            y2: gy + plot.h,
            color: catMinor,
            ...catMinorW ? { widthPx: catMinorW } : {}
          });
        }
      }
    }
    const catBold = model.catAxis?.labelBold ? { bold: true } : {};
    const drawWrap = catRotDeg == null ? catWrapLines(slotW * lblSkip) : null;
    const drawRotate = catRotDeg != null && catRotDeg !== 0 || catRotDeg == null && !drawWrap && model.categories.length > 1 && maxCatW > slotW * lblSkip * rotFactor;
    const rotCos = Math.cos(Math.abs(catRotUsed) * Math.PI / 180);
    const rotSin = Math.sin(Math.abs(catRotUsed) * Math.PI / 180);
    const catLabelBase = catAtZero ? crossY : plot.y + plot.h;
    if (!catLabelsOff)
      model.categories.forEach((cat, i) => {
        if (i % lblSkip) return;
        const cx = plot.x + (catSlot(i) + 0.5) * slotW;
        if (drawRotate) {
          const w = measure(cat, catLabelSizePx);
          const neg = catRotUsed < 0;
          node.labels.push({
            text: cat,
            x: neg ? cx - w * rotCos - catLabelSizePx * 0.5 : cx - catLabelSizePx * 0.5,
            y: plot.y + plot.h + catLabelSizePx * 0.15 + (neg ? w * rotSin : 0),
            fontSizePx: catLabelSizePx,
            color: catLabelColor,
            rotationDeg: catRotUsed,
            ...catBold
          });
          return;
        }
        const lines = drawWrap?.[i] ?? [cat];
        const topY = catAtZero && rev ? catLabelBase - catLabelSizePx * (1.75 + 1.2 * (lines.length - 1)) : catLabelBase + catLabelSizePx * 0.75;
        lines.forEach((line2, li) => {
          node.labels.push({
            text: line2,
            x: cx - measure(line2, catLabelSizePx) / 2,
            y: topY + li * catLabelSizePx * 1.2,
            fontSizePx: catLabelSizePx,
            color: catLabelColor,
            ...catBold
          });
        });
      });
    if (model.categoryGroups && !catLabelsOff) {
      const gy = plot.y + plot.h + catReserve + catLabelSizePx * 0.35;
      const nCatsG = Math.max(model.categories.length, 1);
      const slotWG = plot.w / nCatsG;
      const revG = !!model.catAxis?.reversed;
      model.categoryGroups.forEach((g, gi) => {
        const end = model.categoryGroups[gi + 1]?.start ?? nCatsG;
        const lo = revG ? nCatsG - end : g.start;
        const hi = revG ? nCatsG - g.start : end;
        const cxG = plot.x + (lo + hi) / 2 * slotWG;
        node.labels.push({
          text: g.label,
          x: cxG - measure(g.label, catLabelSizePx) / 2,
          y: gy,
          fontSizePx: catLabelSizePx,
          color: catLabelColor
        });
        const bx = revG ? nCatsG - g.start : g.start;
        if (g.start > 0)
          node.axisLines.push({
            x1: plot.x + bx * slotWG,
            y1: plot.y + plot.h,
            x2: plot.x + bx * slotWG,
            y2: plot.y + plot.h + catReserve + catLabelSizePx * 1.5,
            color: model.catAxis?.lineColor ?? "#888888",
            widthPx: 1
          });
      });
    }
    const dlSize = model.dataLabelPt ? ptToPx(model.dataLabelPt, vp.scale) : labelSizePx * 0.9;
    const dlBold = !!model.dataLabelBold;
    const dLbl = (si, catIdx, cx, y, v, inside) => {
      if (!(model.series[si]?.dataLabels ?? model.dataLabels)) return;
      const text = composeDataLabel(model, si, catIdx, fmtDataLabel(v, labelFmt(model, si)));
      if (!text) return;
      const ov = pointLabelOverride(model, si, catIdx);
      const size = ov?.sizePt ? ptToPx(ov.sizePt, vp.scale) : dlSize;
      node.labels.push({
        text,
        x: cx - measure(text, size) / 2,
        y,
        fontSizePx: size,
        color: inside ? "#FFFFFF" : ov?.color ?? model.defaultTextColor ?? (dlBold ? "#000000" : "#404040"),
        ...dlBold ? { bold: true } : {},
        ...labelBoxOf(model, si, catIdx, measure(text, size))
      });
    };
    if (barSeriesIdx.length && stacked) {
      const gap = (model.gapWidthPct ?? 150) / 100;
      const barW = slotW / (1 + gap);
      for (let i = 0; i < n; i++) {
        const x = plot.x + catSlot(i) * slotW + (slotW - barW) / 2;
        let posAcc = 0;
        let negAcc = 0;
        barSeriesIdx.forEach((si) => {
          const ser = model.series[si];
          const v = valueAt(si, i);
          if (v == null || v === 0) return;
          const color = ser.pointColors?.[i] ?? seriesColor(si);
          const from = v > 0 ? posAcc : negAcc;
          const to = from + v;
          if (v > 0) posAcc = to;
          else negAcc = to;
          const yTop = Math.min(yOf(from), yOf(to));
          const yBot = Math.max(yOf(from), yOf(to));
          if (ser.noFill) return;
          node.bars.push({
            x,
            y: yTop,
            w: barW,
            h: Math.max(yBot - yTop, 0.5),
            color,
            ...pointFill(ser.pointFills?.[i])
          });
          dLbl(si, i, x + barW / 2, (yTop + yBot) / 2 - dlSize * 0.55, ser.values[i], true);
        });
      }
    } else if (barSeriesIdx.length) {
      const gap = (model.gapWidthPct ?? 150) / 100;
      const sCount = Math.max(barSeriesIdx.length, 1);
      const ov = Math.max(-1, Math.min(1, (model.overlapPct ?? 0) / 100));
      const barW = slotW / (1 + (1 - ov) * (sCount - 1) + gap);
      const step = barW * (1 - ov);
      const groupW = barW + step * (sCount - 1);
      const base = Math.max(min, 0);
      barSeriesIdx.forEach((si, slot) => {
        const ser = model.series[si];
        const color = seriesColor(si);
        ser.values.forEach((v, i) => {
          if (v == null || i >= n || ser.noFill) return;
          const x = plot.x + catSlot(i) * slotW + (slotW - groupW) / 2 + slot * step;
          const yTop = Math.min(yOf(v), yOf(base));
          const yBot = Math.max(yOf(v), yOf(base));
          node.bars.push({
            x,
            y: yTop,
            w: barW,
            h: Math.max(yBot - yTop, 0.5),
            color: ser.pointColors?.[i] ?? color,
            ...pointFill(ser.pointFills?.[i])
          });
          const tipAbove = v >= 0 !== rev;
          dLbl(
            si,
            i,
            x + barW / 2,
            tipAbove ? yTop - dlSize * 1.15 - depth3d : yBot + dlSize * 0.15 + depth3d,
            v,
            false
          );
        });
      });
    }
    {
      const lineW = defaultLineWidthPx(model, vp.scale);
      const markerR = Math.max(2, ptToPx(3, vp.scale));
      const areaCum = new Array(n).fill(0);
      const lineCum = new Array(n).fill(0);
      const areaTotals = Array.from(
        { length: n },
        (_, i) => model.series.reduce(
          (a, s) => a + (serKind(s) === "area" ? Math.abs(s.values[i] ?? 0) : 0),
          0
        )
      );
      model.series.forEach((ser, si) => {
        const k = serKind(ser);
        if (k === "bar") return;
        const secSer = onSecAxis(ser);
        const yOfSer = secSer ? yOf2 : yOf;
        const color = seriesColor(si);
        if (k === "area" && stacked && !secSer) {
          const top = [];
          const bottom = [];
          for (let i = 0; i < n; i++) {
            let v = ser.values[i] ?? 0;
            if (grouping === "percentStacked") v = v / (areaTotals[i] || 1) * 100;
            const x = plot.x + (catSlot(i) + 0.5) * slotW;
            const y0 = yOf(areaCum[i]);
            bottom.push(x, y0);
            areaCum[i] += v;
            const y1 = yOf(areaCum[i]);
            top.push(x, y1);
            if (ser.values[i] != null)
              dLbl(si, i, x, (y0 + y1) / 2 - dlSize * 0.55, ser.values[i], true);
          }
          for (let i = bottom.length - 2; i >= 0; i -= 2) top.push(bottom[i], bottom[i + 1]);
          node.polylines.push({ points: top, color, widthPx: 1, closed: true, fill: color });
          return;
        }
        const lineStack = k === "line" && stacked && !secSer && model.kind === "line";
        const pts = [];
        ser.values.forEach((v, i) => {
          if (v == null || i >= n) return;
          const x = plot.x + (catSlot(i) + 0.5) * slotW;
          let vv = v;
          if (lineStack) {
            vv = lineCum[i] + (valueAt(si, i) ?? 0);
            lineCum[i] = vv;
          }
          const y = yOfSer(vv);
          pts.push(x, y);
          if (k === "line" && ser.marker) node.markers.push({ x, y, r: markerR, color });
          dLbl(si, i, x, y - dlSize * 1.3, v, false);
        });
        if (pts.length < 4) return;
        if (ser.fromStock) return;
        if (k === "area") {
          const sMin = secSer ? sec.min : min;
          const sMax = secSer ? sec.max : max;
          const baseY = yOfSer(Math.min(Math.max(0, sMin), sMax));
          node.polylines.push({
            points: [pts[0], baseY, ...pts, pts[pts.length - 2], baseY],
            color,
            widthPx: 1,
            closed: true,
            fill: color
          });
        } else {
          const w = ser.lineWidthPt ? Math.max(1, ptToPx(ser.lineWidthPt, vp.scale)) : lineW;
          node.polylines.push({
            points: pts,
            color,
            widthPx: w,
            ...ser.smooth ? { smooth: true } : {},
            ...ser.dash ? { dash: dashArray(ser.dash, w) } : {}
          });
        }
      });
    }
    if (model.stock) {
      const stockSers = model.series.filter((s) => s.fromStock);
      const yOfS = stockSers[0] && onSecAxis(stockSers[0]) ? yOf2 : yOf;
      const openSer = stockSers.length >= 4 ? stockSers[0] : void 0;
      const closeSer = stockSers.length >= 3 ? stockSers[stockSers.length - 1] : void 0;
      const lineWidth = Math.max(1, ptToPx(1, vp.scale));
      const barW = slotW / (1 + (model.stock.gapWidthPct ?? 150) / 100);
      for (let i = 0; i < n; i++) {
        const vals = stockSers.map((s) => s.values[i]).filter((v) => v != null);
        if (vals.length < 2) continue;
        const x = plot.x + (catSlot(i) + 0.5) * slotW;
        if (model.stock.hiLowLines) {
          node.axisLines.push({
            x1: x,
            y1: yOfS(arrayMax(vals)),
            x2: x,
            y2: yOfS(arrayMin(vals)),
            color: "#000000",
            widthPx: lineWidth
          });
        }
        const open = openSer?.values[i];
        const close = closeSer?.values[i];
        if (model.stock.upDownBars && open != null && close != null && open !== close) {
          const y1 = yOfS(Math.max(open, close));
          const y2 = yOfS(Math.min(open, close));
          node.polylines.push({
            points: [x - barW / 2, y1, x + barW / 2, y1, x + barW / 2, y2, x - barW / 2, y2],
            color: "#000000",
            widthPx: lineWidth,
            closed: true,
            fill: close >= open ? "#FFFFFF" : "#404040"
          });
        }
      }
    }
    if (legendPos && model.series.some((s) => s.name)) {
      const sw = legendSizePx * 0.5;
      const legendTextStyle = {
        fontFamily: chartFont(model),
        fontSizePx: legendSizePx,
        bold: legendBold,
        italic: false
      };
      const legendMeasure = (t) => metrics.measure(t, legendTextStyle);
      const items = (model.legendOrder ?? model.series.map((_, i) => i)).map((i) => ({
        label: model.series[i]?.name ?? "",
        color: seriesColor(i)
      }));
      const itemWs = items.map((it) => sw + 4 + legendMeasure(it.label) + legendSizePx * 0.5);
      const legendEntry = (x, y, it) => {
        node.swatches.push({
          x,
          y: y + legendSizePx * 0.3,
          w: sw,
          h: legendSizePx * 0.5,
          color: it.color
        });
        node.labels.push({
          text: it.label,
          x: x + sw + 4,
          y,
          fontSizePx: legendSizePx,
          color: labelColor,
          ...legendBold ? { bold: true } : {}
        });
      };
      const lay = model.legendLayout;
      const applyLayout = (autoX, autoY, blockW, blockH) => {
        let x = autoX;
        let y = autoY;
        if (lay?.x !== void 0) x = lay.xMode === "edge" ? lay.x * box.w : autoX + lay.x * box.w;
        if (lay?.y !== void 0) y = lay.yMode === "edge" ? lay.y * box.h : autoY + lay.y * box.h;
        return {
          x: Math.min(Math.max(x, pad), Math.max(box.w - blockW - pad, pad)),
          y: Math.min(Math.max(y, pad), Math.max(box.h - blockH - pad, pad))
        };
      };
      if (legendPos === "t" || legendPos === "b") {
        const total = itemWs.reduce((a, b) => a + b, 0);
        const autoX = Math.max((box.w - total) / 2, pad);
        const autoY = legendPos === "t" ? pad : box.h - pad - legendSizePx * 1.2;
        const p = applyLayout(autoX, autoY, total, legendSizePx * 1.2);
        let x = p.x;
        items.forEach((it, i) => {
          legendEntry(x, p.y, it);
          x += itemWs[i];
        });
      } else {
        const colH = items.length * legendSizePx * 1.5;
        const autoY = legendPos === "tr" ? plot.y : Math.max(plot.y + (plot.h - colH) / 2, pad);
        const overlayX = sec ? box.w - pad - legendColW + 6 : valRight ? box.w - pad - valSideW - legendColW + 8 : box.w - pad - labelSizePx * 0.7 - legendColW + 8;
        const autoX = model.legendOverlay ? Math.max(overlayX, plot.x + 4) : plot.x + plot.w + 8 + (sec ? y2LabelW + axisTitle2W + 8 : valRight ? valSideW : 0);
        const p = applyLayout(autoX, autoY, legendColW, colH);
        let y = p.y;
        items.forEach((it) => {
          legendEntry(p.x, y, it);
          y += legendSizePx * 1.5;
        });
      }
    }
    return node;
  }
  function buildOfPieNode(id, sourceId, model, box, vp, metrics) {
    const ser = model.series[0];
    const of = model.ofPie;
    if (!ser || !of) return null;
    const n = ser.values.length;
    const cut = n - Math.min(Math.max(of.splitPos, 1), Math.max(n - 1, 1));
    const palette = chartPalette(model);
    const colorOf = (i) => ser.pointColors?.[i] ?? palette[i % palette.length];
    const pos = (v) => v != null && v > 0 ? v : 0;
    const secVals = ser.values.slice(cut);
    const other = secVals.reduce((a, v) => a + pos(v), 0);
    const mainVals = [...ser.values.slice(0, cut), other];
    const mainColors = [
      ...ser.values.slice(0, cut).map((_, i) => colorOf(i)),
      palette[n % palette.length]
    ];
    const secColors = secVals.map((_, k2) => colorOf(cut + k2));
    const node = emptyChartNode(id, sourceId, box);
    const labelSizePx = ptToPx(chartTextPt(model), vp.scale);
    const labelColor = model.valAxis?.labelColor ?? chartLabelDefault(model);
    const style = {
      fontFamily: chartFont(model),
      fontSizePx: labelSizePx,
      bold: false,
      italic: false
    };
    const measure = (t) => metrics.measure(t, style);
    const pad = Math.max(6, Math.min(box.w, box.h) * 0.03);
    const legendPos = model.legendPos;
    const items = model.categories.map((label, i) => ({ label, color: colorOf(i) }));
    const sideLegend = legendPos === "l" || legendPos === "r" || legendPos === "tr";
    const legendW = sideLegend ? Math.min(
      box.w * 0.4,
      arrayMax(
        items.map((it) => measure(it.label)),
        0
      ) + labelSizePx * 2.2
    ) : 0;
    const legendRowH = labelSizePx * 1.5;
    let plotX = pad;
    let plotY = pad;
    let plotW = box.w - pad * 2;
    let plotH = box.h - pad * 2;
    if (legendPos === "l") {
      plotX += legendW;
      plotW -= legendW;
    } else if (sideLegend) plotW -= legendW;
    else if (legendPos === "t") {
      plotY += legendRowH;
      plotH -= legendRowH;
    } else if (legendPos === "b") plotH -= legendRowH;
    const k = of.secondPieSize / 100;
    const gap = of.gapWidth / 100 * 2 * k;
    const r1 = Math.max(Math.min(plotH / 2, plotW / (2 + gap + 2 * k)), 5);
    const r2 = r1 * k;
    const x0 = plotX + (plotW - (2 * r1 + gap * r1 + 2 * r2)) / 2;
    const cy = plotY + plotH / 2;
    const cx1 = x0 + r1;
    const cx2 = x0 + 2 * r1 + gap * r1 + r2;
    const { ofPie: _of, legendPos: _lp, plotLayout: _pl, pctBase: _pb, ...rest } = model;
    const seriesTotal = ser.values.reduce((a, v) => a + pos(v), 0);
    const {
      pointColors: _pc,
      pointNoFill: _pn,
      pointFills: _pf,
      pointLines: _pln,
      pointExplosionPct: _pe,
      explosionPct: _e,
      ...serRest
    } = ser;
    const sub = (values, colors, categories, cx, r) => buildPieNode(
      id,
      sourceId,
      {
        ...rest,
        categories,
        series: [{ ...serRest, values, pointColors: colors }],
        pctBase: seriesTotal,
        plotLayout: {
          x: (cx - r) / box.w,
          y: (cy - r) / box.h,
          w: 2 * r / box.w,
          h: 2 * r / box.h
        }
      },
      box,
      vp,
      metrics
    );
    const main2 = sub(mainVals, mainColors, [...model.categories.slice(0, cut), ""], cx1, r1);
    const sec = sub(secVals, secColors, model.categories.slice(cut), cx2, r2);
    for (const part of [main2, sec]) {
      if (!part) continue;
      if (part.wedges?.length) (node.wedges ??= []).push(...part.wedges);
      if (part.paths?.length) (node.paths ??= []).push(...part.paths);
      node.labels.push(...part.labels);
    }
    const mainTotal = mainVals.reduce((a, v) => a + pos(v), 0);
    if (other > 0 && mainTotal > 0) {
      const start = -90 + (model.firstSliceAngDeg ?? 0) + (mainTotal - other) / mainTotal * 360;
      const end = start + other / mainTotal * 360;
      const at = (deg) => {
        const t = deg * Math.PI / 180;
        return [cx1 + Math.cos(t) * r1, cy + Math.sin(t) * r1];
      };
      node.polylines.push(
        { points: [...at(start), cx2, cy - r2], color: "#A6A6A6", widthPx: 1 },
        { points: [...at(end), cx2, cy + r2], color: "#A6A6A6", widthPx: 1 }
      );
    }
    if (legendPos) {
      const sw = labelSizePx * 0.5;
      const entry = (x, y, it) => {
        node.swatches.push({
          x,
          y: y + labelSizePx * 0.25,
          w: sw,
          h: labelSizePx * 0.5,
          color: it.color
        });
        node.labels.push({
          text: it.label,
          x: x + sw + 4,
          y,
          fontSizePx: labelSizePx,
          color: labelColor
        });
      };
      if (legendPos === "t" || legendPos === "b") {
        const itemWs = items.map((it) => sw + 4 + measure(it.label) + labelSizePx * 0.5);
        let x = Math.max((box.w - itemWs.reduce((a, b) => a + b, 0)) / 2, pad);
        const y = legendPos === "t" ? pad * 0.5 : box.h - pad * 0.5 - labelSizePx * 1.2;
        items.forEach((it, i) => {
          entry(x, y, it);
          x += itemWs[i];
        });
      } else {
        const x = legendPos === "l" ? pad : box.w - legendW;
        let y = Math.max(cy - items.length * legendRowH / 2, pad);
        for (const it of items) {
          entry(x, y, it);
          y += legendRowH;
        }
      }
    }
    return node;
  }
  function buildPieNode(id, sourceId, model, box, vp, metrics) {
    const ser = model.series[0];
    if (!ser) return null;
    if (model.ofPie) return buildOfPieNode(id, sourceId, model, box, vp, metrics);
    const vals = ser.values.map((v) => v != null && v > 0 ? v : 0);
    const total = vals.reduce((a, b) => a + b, 0);
    if (total <= 0) return null;
    const pctTotal = model.pctBase ?? total;
    const node = {
      id,
      type: "chart",
      box,
      sourceId,
      gridLines: [],
      axisLines: [],
      labels: [],
      bars: [],
      polylines: [],
      markers: [],
      swatches: [],
      wedges: []
    };
    const labelSizePx = ptToPx(chartTextPt(model), vp.scale);
    const labelColor = model.valAxis?.labelColor ?? chartLabelDefault(model);
    const style = {
      fontFamily: chartFont(model),
      fontSizePx: labelSizePx,
      bold: false,
      italic: false
    };
    const measure = (text) => metrics.measure(text, style);
    const palette = chartPalette(model);
    const sliceColor = (i) => ser.pointColors?.[i] ?? (model.varyColors === false ? ser.color ?? palette[0] : palette[i % palette.length]);
    const swatchColor = (i) => ser.pointNoFill?.[i] ? ser.pointLines?.[i]?.color ?? sliceColor(i) : sliceColor(i);
    const wedgeStroke = (i) => {
      const ln = ser.pointLines?.[i];
      if (!ln) return {};
      if (ln.color === null) return { strokeWidthPx: 0 };
      return {
        stroke: ln.color,
        ...ln.widthPt != null ? { strokeWidthPx: ptToPx(ln.widthPt, vp.scale) } : {}
      };
    };
    const faceProps = (i) => {
      const st = wedgeStroke(i);
      const fill = ser.pointNoFill?.[i] ? "transparent" : sliceColor(i);
      if (st.strokeWidthPx === 0) return { fill };
      return {
        fill,
        stroke: st.stroke ?? "#ffffff",
        ...st.strokeWidthPx != null ? { strokeWidthPx: st.strokeWidthPx } : {}
      };
    };
    const pad = Math.max(6, Math.min(box.w, box.h) * 0.03);
    const legendPos = model.legendPos;
    const legendItems = model.categories.map((cat, i) => ({
      label: cat,
      color: swatchColor(i)
    }));
    const legendRowH = labelSizePx * 1.5;
    let plotW = box.w - pad * 2;
    let plotH = box.h - pad * 2;
    let plotX = pad;
    let plotY = pad;
    const sideLegendW = legendPos === "l" || legendPos === "r" || legendPos === "tr" ? Math.min(
      box.w * 0.4,
      arrayMax(
        legendItems.map((it) => measure(it.label)),
        0
      ) + labelSizePx * 2.2
    ) : 0;
    if (legendPos === "r" || legendPos === "tr") plotW -= sideLegendW;
    else if (legendPos === "l") {
      plotW -= sideLegendW;
      plotX += sideLegendW;
    } else if (legendPos === "t") {
      plotY += legendRowH;
      plotH -= legendRowH;
    } else if (legendPos === "b") plotH -= legendRowH;
    const L2 = model.plotLayout;
    if (L2) {
      plotX = L2.x * box.w;
      plotY = L2.y * box.h;
      plotW = Math.max(L2.w * box.w, 10);
      plotH = Math.max(L2.h * box.h, 10);
    }
    const explAt = (i) => Math.max(ser.pointExplosionPct?.[i] ?? ser.explosionPct ?? 0, 0) / 100;
    const maxExpl = vals.reduce((m, v, i) => v > 0 ? Math.max(m, explAt(i)) : m, 0);
    const pieReservePx = emuToPx(144e3, vp.scale);
    let pieHalfPx = Math.min(plotW, plotH) / 2 + pad;
    if (legendPos === "l") pieHalfPx = Math.min(pieHalfPx, plotW / 2);
    if (legendPos === "t") pieHalfPx = Math.min(pieHalfPx, plotH / 2);
    const outerR = L2 ? Math.max(Math.min(plotW, plotH) / 2, 5) / (1 + 2 * maxExpl) : Math.max(pieHalfPx - pieReservePx, 5) / (1 + 2 * maxExpl);
    const cx = plotX + plotW / 2;
    let cy = plotY + plotH / 2;
    const innerR = outerR * Math.min(Math.max(model.holePct ?? 0, 0), 90) / 100;
    const p3d = !!model.pseudo3D && innerR === 0;
    const kY = p3d ? Math.min(Math.max(Math.sin((model.rotXDeg ?? 30) * Math.PI / 180), 0.35), 0.9) : 1;
    const DEPTH_K = 0.38;
    const rx = p3d ? Math.max(Math.min(plotW / 2, plotH * 0.81 / (kY * (2 + DEPTH_K))), 5) / (1 + 2 * maxExpl) : outerR;
    const ry = rx * kY;
    const depth = p3d ? ry * DEPTH_K : 0;
    if (p3d) cy = plotY + (plotH - ry * (2 + DEPTH_K)) / 2 + ry;
    const explOffset = (startDeg, sweep, i) => {
      const mid = (startDeg + sweep / 2) * Math.PI / 180;
      const off = explAt(i) * 2 * rx;
      return { dx: Math.cos(mid) * off, dy: Math.sin(mid) * off * kY };
    };
    const ptAt = (deg, dx = 0, dy = 0) => {
      const t = deg * Math.PI / 180;
      return { x: cx + dx + Math.cos(t) * rx, y: cy + dy + Math.sin(t) * ry };
    };
    if (p3d) {
      node.paths = node.paths ?? [];
      let a = -90 + (model.firstSliceAngDeg ?? 0);
      vals.forEach((v, i) => {
        if (v <= 0) return;
        const sweep = v / total * 360;
        const { dx, dy } = explOffset(a, sweep, i);
        if (ser.pointNoFill?.[i]) {
          a += sweep;
          return;
        }
        for (const off of [-360, 0, 360]) {
          const b1 = Math.max(a + off, 0);
          const b2 = Math.min(a + off + sweep, 180);
          if (b2 <= b1) continue;
          const p1 = ptAt(b1, dx, dy);
          const p2 = ptAt(b2, dx, dy);
          const large = b2 - b1 > 180 ? 1 : 0;
          node.paths.push({
            d: `M ${p1.x} ${p1.y} A ${rx} ${ry} 0 ${large} 1 ${p2.x} ${p2.y} L ${p2.x} ${p2.y + depth} A ${rx} ${ry} 0 ${large} 0 ${p1.x} ${p1.y + depth} Z`,
            fill: shade2(sliceColor(i), 0.72)
          });
        }
        a += sweep;
      });
    }
    let angle = -90 + (model.firstSliceAngDeg ?? 0);
    vals.forEach((v, i) => {
      if (v <= 0) return;
      const sweep = v / total * 360;
      const { dx, dy } = explOffset(angle, sweep, i);
      if (p3d) {
        const p1 = ptAt(angle, dx, dy);
        if (sweep >= 359.999) {
          const pm = ptAt(angle + 180, dx, dy);
          node.paths.push({
            d: `M ${p1.x} ${p1.y} A ${rx} ${ry} 0 1 1 ${pm.x} ${pm.y} A ${rx} ${ry} 0 1 1 ${p1.x} ${p1.y} Z`,
            ...faceProps(i)
          });
        } else {
          const p2 = ptAt(angle + sweep, dx, dy);
          const large = sweep > 180 ? 1 : 0;
          node.paths.push({
            d: `M ${cx + dx} ${cy + dy} L ${p1.x} ${p1.y} A ${rx} ${ry} 0 ${large} 1 ${p2.x} ${p2.y} Z`,
            ...faceProps(i)
          });
        }
      } else {
        node.wedges.push({
          cx: cx + dx,
          cy: cy + dy,
          outerR,
          innerR,
          startDeg: angle,
          sweepDeg: sweep,
          color: sliceColor(i),
          ...ser.pointNoFill?.[i] ? { noFill: true } : {},
          ...wedgeStroke(i)
        });
      }
      if (model.series[0]?.dataLabels ?? model.dataLabels) {
        const midRad = (angle + sweep / 2) * Math.PI / 180;
        const r = innerR > 0 ? (innerR + outerR) / 2 : outerR * 0.66;
        const pctText = `${Math.round(v / pctTotal * 100)}%`;
        const ov = pointLabelOverride(model, 0, i);
        const showPct = ov ? ov.pct : model.dataLabelsPct || model.dataLabelsValPct;
        const showVal = ov ? ov.val : !model.dataLabelsPct;
        const valueText = [showVal ? fmtNum(v) : "", showPct ? pctText : ""].filter(Boolean).join(", ");
        const text = composeDataLabel(model, 0, i, valueText);
        const dlPt = ov?.sizePt ?? model.dataLabelPt;
        const dlSize = dlPt ? ptToPx(dlPt, vp.scale) : labelSizePx * 0.9;
        const dlBold = !!model.dataLabelBold;
        const dlW = metrics.measure(text, { ...style, fontSizePx: dlSize, bold: dlBold });
        if (text)
          node.labels.push({
            text,
            x: cx + dx + Math.cos(midRad) * (p3d ? rx * 0.66 : r) - dlW / 2,
            y: cy + dy + Math.sin(midRad) * (p3d ? ry * 0.66 : r) - dlSize * 0.55,
            fontSizePx: dlSize,
            color: ov?.color ?? "#FFFFFF",
            ...dlBold ? { bold: true } : {},
            ...labelBoxOf(model, 0, i, dlW)
          });
      }
      angle += sweep;
    });
    if (legendPos) {
      const sw = labelSizePx * 0.5;
      const lay = model.legendLayout;
      const rtl = !!model.legendRtl;
      const entry = (x, y, it, itemW, textW) => {
        const swX = rtl ? x + itemW - sw : x;
        const txX = rtl ? x + itemW - sw - 4 - textW : x + sw + 4;
        node.swatches.push({
          x: swX,
          y: y + labelSizePx * 0.25,
          w: sw,
          h: labelSizePx * 0.5,
          color: it.color
        });
        node.labels.push({ text: it.label, x: txX, y, fontSizePx: labelSizePx, color: labelColor });
      };
      if (legendPos === "t" || legendPos === "b") {
        const textWs = legendItems.map((it) => measure(it.label));
        const itemWs = textWs.map((w) => sw + 4 + w + labelSizePx * 0.5);
        const totalW = itemWs.reduce((a, b) => a + b, 0);
        const rect = lay?.w !== void 0 && lay.x !== void 0 && lay.xMode === "edge" ? {
          x: lay.x * box.w,
          y: (lay.y ?? (legendPos === "t" ? 0 : 0.85)) * box.h,
          w: lay.w * box.w
        } : null;
        if (rect && totalW > rect.w) {
          const rowH = labelSizePx * 1.5;
          legendItems.forEach((it, i) => {
            const w = itemWs[i];
            const x = rtl ? Math.max(rect.x + rect.w - w, rect.x) : rect.x;
            entry(x, rect.y + i * rowH, it, w, textWs[i]);
          });
        } else {
          let x = rect ? rtl ? rect.x + rect.w - totalW : rect.x : Math.max((box.w - totalW) / 2, pad);
          const y = rect ? rect.y : legendPos === "t" ? pad * 0.5 : box.h - pad * 0.5 - labelSizePx * 1.2;
          const ordered = rtl ? [...legendItems.keys()].reverse() : [...legendItems.keys()];
          for (const i of ordered) {
            entry(x, y, legendItems[i], itemWs[i], textWs[i]);
            x += itemWs[i];
          }
        }
      } else {
        const x = legendPos === "l" ? pad : box.w - sideLegendW;
        let y = Math.max(cy - legendItems.length * legendRowH / 2, pad);
        for (const it of legendItems) {
          node.swatches.push({
            x,
            y: y + labelSizePx * 0.25,
            w: sw,
            h: labelSizePx * 0.5,
            color: it.color
          });
          node.labels.push({
            text: it.label,
            x: x + sw + 4,
            y,
            fontSizePx: labelSizePx,
            color: labelColor
          });
          y += legendRowH;
        }
      }
    }
    return node;
  }
  function buildBar3DNode(id, sourceId, model, box, vp, metrics) {
    const b3 = model.bar3D;
    const node = emptyChartNode(id, sourceId, box);
    node.paths = [];
    const labelSizePx = ptToPx(model.valAxis?.labelSizePt ?? chartTextPt(model), vp.scale);
    const labelColor = model.valAxis?.labelColor ?? chartLabelDefault(model);
    const catLabelSizePx = ptToPx(
      model.catAxis?.labelSizePt ?? model.valAxis?.labelSizePt ?? chartTextPt(model),
      vp.scale
    );
    const catLabelColor = model.catAxis?.labelColor ?? labelColor;
    const style = (sizePx) => ({
      fontFamily: chartFont(model),
      fontSizePx: sizePx,
      bold: false,
      italic: false
    });
    const measure = (text, sizePx) => metrics.measure(text, style(sizePx));
    const palette = chartPalette(model);
    const seriesColor = (i) => model.series[i]?.color ?? palette[(model.series[i]?.paletteIdx ?? i) % palette.length];
    const allVals = model.series.flatMap((s) => s.values.filter((v) => v != null));
    if (!allVals.length) return null;
    const { min, max, ticks } = ppTicks(
      model.valAxis?.min ?? arrayMin(allVals, 0),
      model.valAxis?.max ?? arrayMax(allVals, 0),
      model.valAxis?.min == null,
      model.valAxis?.max == null,
      false,
      void 0,
      true
    );
    const pad = Math.max(4, box.w * 0.01);
    const legendPos = model.legendPos;
    const legendH = legendPos === "t" || legendPos === "b" ? labelSizePx * 1.6 : 0;
    const valLabelsOff = !!model.valAxis?.hidden || !!model.valAxis?.tickLblHidden || !!model.valAxis?.tickLblGarbage;
    const valNoReserve = !!model.valAxis?.hidden || !!model.valAxis?.tickLblHidden;
    const tickLabels = ticks.map((t) => fmtNum(t));
    const tickW = valNoReserve ? 0 : arrayMax(
      tickLabels.map((t) => measure(t, labelSizePx)),
      0
    );
    const legendW = legendPos === "r" || legendPos === "l" ? labelSizePx + arrayMax(
      model.series.map((s) => measure(s.name ?? "", labelSizePx)),
      0
    ) + 12 : 0;
    const nCats = arrayMax(
      model.series.map((s) => s.values.length),
      Math.max(model.categories.length, 1)
    );
    const nSer = Math.max(model.series.length, 1);
    const serAxW = b3.serAxLabels ? (arrayMax(
      model.series.map((s) => measure(s.name ?? "", catLabelSizePx)),
      0
    ) + 8) / 2 : 0;
    const availX = pad + tickW + 8;
    const availR = box.w - pad - legendW - serAxW;
    const availY = pad + (legendPos === "t" ? legendH + 4 : 0) + labelSizePx * 0.6;
    const availB = box.h - pad - catLabelSizePx * 1.6 - (legendPos === "b" ? legendH : 0);
    const availW = Math.max(availR - availX, 20);
    const availH = Math.max(availB - availY, 20);
    const sa = Math.sin(b3.rotX * Math.PI / 180);
    const ca = Math.cos(b3.rotX * Math.PI / 180);
    const sb = Math.sin(b3.rotY * Math.PI / 180);
    const cb = Math.cos(b3.rotY * Math.PI / 180);
    const gapW = (model.gapWidthPct ?? 150) / 100;
    const depthFactor = b3.depthPct / 100;
    const depthPerWf = 1 / nCats / (1 + gapW) * depthFactor * (1 + b3.gapDepthPct / 100) * nSer;
    const Wf = availW * 0.88 / (cb + depthPerWf * sb);
    const D2 = depthPerWf * Wf;
    const Hf = Math.max((availH * 0.84 - Wf * sa * sb - D2 * sa * cb) / ca, 20);
    const projW = Wf * cb + D2 * sb;
    const projH = Hf * ca + Wf * sa * sb + D2 * sa * cb;
    const x0 = availX + (availW - projW) * 0.42;
    const yTop = availY + (availH - projH) * 0.3 + D2 * sa * cb;
    const px = (x, y, z) => [
      x0 + x * cb + z * sb,
      yTop + y * ca + x * sa * sb - z * sa * cb
    ];
    const P = (x, y, z) => {
      const [sx, sy] = px(x, y, z);
      return `${Math.round(sx * 100) / 100} ${Math.round(sy * 100) / 100}`;
    };
    const yOf = (v) => Hf * (1 - (v - min) / (max - min || 1));
    const gridColor = model.valAxis?.gridColor ?? "#D9D9D9";
    const wall = (x1, y1, z1, x2, y2, z2) => {
      const [ax, ay] = px(x1, y1, z1);
      const [bx, by] = px(x2, y2, z2);
      node.gridLines.push({ x1: ax, y1: ay, x2: bx, y2: by, color: gridColor });
    };
    for (const t of ticks) {
      const y = yOf(t);
      wall(0, y, D2, Wf, y, D2);
      wall(0, y, 0, 0, y, D2);
    }
    wall(0, Hf, 0, 0, Hf, D2);
    wall(Wf, Hf, 0, Wf, Hf, D2);
    wall(0, Hf, D2, Wf, Hf, D2);
    wall(0, 0, D2, 0, Hf, D2);
    const axisColor = model.valAxis?.lineColor ?? model.catAxis?.lineColor ?? "#888888";
    const axisW = Math.max(1, ptToPx(1, vp.scale));
    const [fblx, fbly] = px(0, Hf, 0);
    const [fbrx, fbry] = px(Wf, Hf, 0);
    node.axisLines.push({ x1: fblx, y1: fbly, x2: fbrx, y2: fbry, color: axisColor, widthPx: axisW });
    if (!valLabelsOff)
      ticks.forEach((t, i) => {
        const [, sy] = px(0, yOf(t), 0);
        node.labels.push({
          text: tickLabels[i],
          x: x0 - 6 - measure(tickLabels[i], labelSizePx),
          y: sy - labelSizePx * 0.55,
          fontSizePx: labelSizePx,
          color: labelColor
        });
      });
    const slotW = Wf / nCats;
    const barW = slotW / (1 + gapW);
    const barD = barW * depthFactor;
    const depthSlot = barD * (1 + b3.gapDepthPct / 100);
    const base = Math.max(min, 0);
    for (let si = nSer - 1; si >= 0; si--) {
      const ser = model.series[si];
      const z0 = si * depthSlot + (depthSlot - barD) / 2;
      const z1 = z0 + barD;
      for (let i = 0; i < nCats; i++) {
        const v = ser.values[i];
        if (v == null) continue;
        const bx = i * slotW + (slotW - barW) / 2;
        const yT = yOf(Math.max(v, base));
        const yB = yOf(Math.min(v, base));
        if (yB - yT < 0.5) continue;
        const color = ser.pointColors?.[i] ?? seriesColor(si);
        node.paths.push(
          {
            d: `M ${P(bx, yT, z1)} L ${P(bx + barW, yT, z1)} L ${P(bx + barW, yT, z0)} L ${P(bx, yT, z0)} Z`,
            fill: shade2(color, 0.82)
          },
          {
            d: `M ${P(bx + barW, yT, z0)} L ${P(bx + barW, yT, z1)} L ${P(bx + barW, yB, z1)} L ${P(bx + barW, yB, z0)} Z`,
            fill: shade2(color, 0.62)
          },
          {
            d: `M ${P(bx, yT, z0)} L ${P(bx + barW, yT, z0)} L ${P(bx + barW, yB, z0)} L ${P(bx, yB, z0)} Z`,
            fill: color
          }
        );
      }
    }
    const catLabelsOff = !!model.catAxis?.hidden || !!model.catAxis?.tickLblHidden || !!model.catAxis?.tickLblGarbage;
    if (!catLabelsOff)
      model.categories.forEach((cat, i) => {
        const [cxs, cys] = px((i + 0.5) * slotW, Hf, 0);
        node.labels.push({
          text: cat,
          x: cxs - measure(cat, catLabelSizePx) / 2,
          y: cys + catLabelSizePx * 0.4,
          fontSizePx: catLabelSizePx,
          color: catLabelColor
        });
      });
    if (b3.serAxLabels)
      model.series.forEach((ser, si) => {
        if (!ser.name) return;
        const [sx, sy] = px(Wf, Hf, si * depthSlot + depthSlot / 2);
        node.labels.push({
          text: ser.name,
          x: sx + 6,
          y: sy - catLabelSizePx * 0.35,
          fontSizePx: catLabelSizePx,
          color: catLabelColor
        });
      });
    const legendYOff = legendPos === "r" || legendPos === "l" ? Math.max((availH - model.series.length * labelSizePx * 1.5) / 2, 0) : 0;
    addSeriesLegend(
      node,
      model,
      box,
      { x: x0, y: availY + legendYOff, w: box.w - x0 - pad - legendW, h: availH },
      labelSizePx,
      measure,
      pad,
      seriesColor
    );
    return node;
  }
  function buildArea3DNode(id, sourceId, model, box, vp, metrics) {
    const a3 = model.area3D;
    const grouping = model.grouping ?? "standard";
    const stacked = grouping === "stacked" || grouping === "percentStacked";
    const node = emptyChartNode(id, sourceId, box);
    node.paths = [];
    const labelSizePx = ptToPx(model.valAxis?.labelSizePt ?? chartTextPt(model), vp.scale);
    const labelColor = model.valAxis?.labelColor ?? chartLabelDefault(model);
    const catLabelSizePx = ptToPx(
      model.catAxis?.labelSizePt ?? model.valAxis?.labelSizePt ?? chartTextPt(model),
      vp.scale
    );
    const catLabelColor = model.catAxis?.labelColor ?? labelColor;
    const style = (sizePx) => ({
      fontFamily: chartFont(model),
      fontSizePx: sizePx,
      bold: false,
      italic: false
    });
    const measure = (text, sizePx) => metrics.measure(text, style(sizePx));
    const palette = chartPalette(model);
    const seriesColor = (i) => model.series[i]?.color ?? palette[(model.series[i]?.paletteIdx ?? i) % palette.length];
    const allVals = model.series.flatMap((s) => s.values.filter((v) => v != null));
    if (!allVals.length) return null;
    const nCats = arrayMax(
      model.series.map((s) => s.values.length),
      Math.max(model.categories.length, 1)
    );
    const nSer = Math.max(model.series.length, 1);
    const catAbsTotals = Array.from(
      { length: nCats },
      (_, i) => model.series.reduce((a, s) => a + Math.abs(s.values[i] ?? 0), 0)
    );
    const valueAt = (si, i) => {
      const v = model.series[si]?.values[i] ?? 0;
      if (grouping !== "percentStacked") return v;
      return v / (catAbsTotals[i] || 1) * 100;
    };
    let dataMax;
    let dataMin;
    if (stacked) {
      const posSums = Array.from(
        { length: nCats },
        (_, i) => model.series.reduce((a, _s, si) => a + Math.max(valueAt(si, i), 0), 0)
      );
      const negSums = Array.from(
        { length: nCats },
        (_, i) => model.series.reduce((a, _s, si) => a + Math.min(valueAt(si, i), 0), 0)
      );
      dataMax = arrayMax(posSums, 0);
      dataMin = arrayMin(negSums, 0);
    } else {
      dataMax = arrayMax(allVals, 0);
      dataMin = arrayMin(allVals, 0);
    }
    if (grouping === "percentStacked") {
      dataMax = 100;
      dataMin = dataMin < 0 ? -100 : 0;
    }
    const autoMin = model.valAxis?.min == null && grouping !== "percentStacked";
    const autoMax = model.valAxis?.max == null && grouping !== "percentStacked";
    const tickArgs = [model.valAxis?.min ?? dataMin, model.valAxis?.max ?? dataMax];
    const pad = Math.max(4, box.w * 0.01);
    const legendPos = model.legendPos;
    const legendH = legendPos === "t" || legendPos === "b" ? labelSizePx * 1.6 : 0;
    const valLabelsOff = !!model.valAxis?.hidden || !!model.valAxis?.tickLblHidden || !!model.valAxis?.tickLblGarbage;
    const valNoReserve = !!model.valAxis?.hidden || !!model.valAxis?.tickLblHidden;
    const legendW = legendPos === "r" || legendPos === "l" ? labelSizePx + arrayMax(
      model.series.map((s) => measure(s.name ?? "", labelSizePx)),
      0
    ) + 12 : 0;
    const serAxW = a3.serAxLabels ? (arrayMax(
      model.series.map((s) => measure(s.name ?? "", catLabelSizePx)),
      0
    ) + 8) / 2 : 0;
    const catLabelsOff = !!model.catAxis?.hidden || !!model.catAxis?.tickLblHidden || !!model.catAxis?.tickLblGarbage;
    const hasCatLabels = !catLabelsOff && model.categories.some((c) => !!c);
    const nRows = stacked ? 1 : nSer;
    const depthPerWf = 0.225 + 0.135 * (nRows - 1);
    const rowPerWf = depthPerWf / nRows;
    const ribbonPerWf = rowPerWf * 0.62;
    const sa = Math.sin(a3.rotX * Math.PI / 180);
    const ca = Math.cos(a3.rotX * Math.PI / 180);
    const sb = Math.sin(a3.rotY * Math.PI / 180);
    const cb = Math.cos(a3.rotY * Math.PI / 180);
    const layoutPass = (maxIntervals) => {
      const t = ppTicks(tickArgs[0], tickArgs[1], autoMin, autoMax, false, maxIntervals, true);
      const tickLabels2 = t.ticks.map(
        (v) => grouping === "percentStacked" ? `${fmtNum(v)}%` : fmtNum(v)
      );
      const tickW = valNoReserve ? 0 : arrayMax(
        tickLabels2.map((s) => measure(s, labelSizePx)),
        0
      );
      const availX = pad + tickW + 8;
      const availR = box.w - pad - legendW - serAxW;
      const availY2 = pad + (legendPos === "t" ? legendH + 4 : 0) + labelSizePx * 0.6;
      const availB = box.h - pad - (hasCatLabels ? catLabelSizePx * 1.6 : 0) - (legendPos === "b" ? legendH : 0);
      const availW = Math.max(availR - availX, 20);
      const availH2 = Math.max(availB - availY2, 20);
      const dd = depthPerWf - 0.225;
      const wFill = 0.88 * (1 - 0.35 * dd);
      const hFill = 0.78 * (1 - 1.7 * dd);
      const Wf2 = availW * wFill / (cb + depthPerWf * sb);
      const D3 = depthPerWf * Wf2;
      const Hf2 = Math.max((availH2 * hFill - Wf2 * sa * sb - D3 * sa * cb) / ca, 20);
      const projW = Wf2 * cb + D3 * sb;
      const projH = Hf2 * ca + Wf2 * sa * sb + D3 * sa * cb;
      const x02 = availX + (availW - projW) * (0.42 + 1.5 * dd);
      const yTop2 = availY2 + (availH2 - projH) * 0.37 + D3 * sa * cb;
      const cap = Math.max(2, Math.min(10, Math.floor(Hf2 / (labelSizePx * 1.75))));
      return { ...t, tickLabels: tickLabels2, availY: availY2, availH: availH2, Wf: Wf2, D: D3, Hf: Hf2, x0: x02, yTop: yTop2, cap };
    };
    const { ticks, min, max, tickLabels, availY, availH, Wf, D: D2, Hf, x0, yTop } = layoutPass(
      layoutPass().cap
    );
    const px = (x, y, z) => [
      x0 + x * cb + z * sb,
      yTop + y * ca + x * sa * sb - z * sa * cb
    ];
    const P = (x, y, z) => {
      const [sx, sy] = px(x, y, z);
      return `${Math.round(sx * 100) / 100} ${Math.round(sy * 100) / 100}`;
    };
    const yOf = (v) => Hf * (1 - (v - min) / (max - min || 1));
    const gridColor = model.valAxis?.gridColor ?? "#D9D9D9";
    const wall = (x1, y1, z1, x2, y2, z2) => {
      const [ax, ay] = px(x1, y1, z1);
      const [bx, by] = px(x2, y2, z2);
      node.gridLines.push({ x1: ax, y1: ay, x2: bx, y2: by, color: gridColor });
    };
    for (const t of ticks) {
      const y = yOf(t);
      wall(0, y, D2, Wf, y, D2);
      wall(0, y, 0, 0, y, D2);
    }
    wall(0, Hf, 0, 0, Hf, D2);
    wall(Wf, Hf, 0, Wf, Hf, D2);
    wall(0, Hf, D2, Wf, Hf, D2);
    wall(0, 0, D2, 0, Hf, D2);
    const axisColor = model.valAxis?.lineColor ?? model.catAxis?.lineColor ?? "#888888";
    const axisW = Math.max(1, ptToPx(1, vp.scale));
    const [fblx, fbly] = px(0, Hf, 0);
    const [fbrx, fbry] = px(Wf, Hf, 0);
    node.axisLines.push({ x1: fblx, y1: fbly, x2: fbrx, y2: fbry, color: axisColor, widthPx: axisW });
    if (!valLabelsOff)
      ticks.forEach((t, i) => {
        const [, sy] = px(0, yOf(t), 0);
        node.labels.push({
          text: tickLabels[i],
          x: x0 - 6 - measure(tickLabels[i], labelSizePx),
          y: sy - labelSizePx * 0.55,
          fontSizePx: labelSizePx,
          color: labelColor
        });
      });
    const xOf = (i) => nCats > 1 ? i / (nCats - 1) * Wf : Wf / 2;
    const base = Math.min(Math.max(0, min), max);
    const yBase = yOf(base);
    const ribbonD = ribbonPerWf * Wf;
    const rowSlot = rowPerWf * Wf;
    const roof = (ys, z0, z1, color) => {
      for (let i = 0; i + 1 < nCats; i++)
        node.paths.push({
          d: `M ${P(xOf(i), ys[i], z0)} L ${P(xOf(i + 1), ys[i + 1], z0)} L ${P(xOf(i + 1), ys[i + 1], z1)} L ${P(xOf(i), ys[i], z1)} Z`,
          fill: shade2(color, 0.82),
          stroke: shade2(color, 0.62)
        });
    };
    const endCap = (yT, yB, z0, z1, color) => {
      if (yB - yT < 0.5) return;
      node.paths.push({
        d: `M ${P(Wf, yT, z0)} L ${P(Wf, yT, z1)} L ${P(Wf, yB, z1)} L ${P(Wf, yB, z0)} Z`,
        fill: shade2(color, 0.72),
        stroke: shade2(color, 0.62)
      });
    };
    if (stacked) {
      const z0 = 0;
      const z1 = ribbonD;
      const cum = new Array(nCats).fill(0);
      let topYs = null;
      let topColor = "";
      for (let si = 0; si < nSer; si++) {
        const hasVals = model.series[si].values.some((v) => v != null);
        if (!hasVals) continue;
        const y0s = cum.map((c) => yOf(c));
        for (let i = 0; i < nCats; i++) cum[i] = cum[i] + Math.max(valueAt(si, i), 0);
        const y1s = cum.map((c) => yOf(c));
        const color = seriesColor(si);
        const up = y1s.map((y, i) => `${i ? "L" : "M"} ${P(xOf(i), y, z0)}`).join(" ");
        const down = [...y0s.keys()].reverse().map((i) => `L ${P(xOf(i), y0s[i], z0)}`).join(" ");
        node.paths.push({ d: `${up} ${down} Z`, fill: color, stroke: shade2(color, 0.62) });
        endCap(y1s[nCats - 1], y0s[nCats - 1], z0, z1, color);
        topYs = y1s;
        topColor = color;
      }
      if (topYs) roof(topYs, z0, z1, topColor);
    } else {
      for (let si = nSer - 1; si >= 0; si--) {
        const ser = model.series[si];
        if (!ser.values.some((v) => v != null)) continue;
        const z0 = si * rowSlot;
        const z1 = z0 + ribbonD;
        const ys = Array.from({ length: nCats }, (_, i) => yOf(Math.max(valueAt(si, i), base)));
        const color = seriesColor(si);
        roof(ys, z0, z1, color);
        endCap(ys[nCats - 1], yBase, z0, z1, color);
        const up = ys.map((y, i) => `${i ? "L" : "M"} ${P(xOf(i), y, z0)}`).join(" ");
        node.paths.push({
          d: `${up} L ${P(Wf, yBase, z0)} L ${P(0, yBase, z0)} Z`,
          fill: color,
          stroke: shade2(color, 0.62)
        });
      }
    }
    if (hasCatLabels)
      model.categories.forEach((cat, i) => {
        if (!cat) return;
        const [cxs, cys] = px(xOf(i), Hf, 0);
        node.labels.push({
          text: cat,
          x: cxs - measure(cat, catLabelSizePx) / 2,
          y: cys + catLabelSizePx * 0.4,
          fontSizePx: catLabelSizePx,
          color: catLabelColor
        });
      });
    if (a3.serAxLabels && !stacked)
      model.series.forEach((ser, si) => {
        if (!ser.name) return;
        const [sx, sy] = px(Wf, Hf, si * rowSlot + rowSlot / 2);
        node.labels.push({
          text: ser.name,
          x: sx + 6,
          y: sy - catLabelSizePx * 0.35,
          fontSizePx: catLabelSizePx,
          color: catLabelColor
        });
      });
    const legendYOff = legendPos === "r" || legendPos === "l" ? Math.max((availH - model.series.length * labelSizePx * 1.5) / 2, 0) : 0;
    addSeriesLegend(
      node,
      model,
      box,
      { x: x0, y: availY + legendYOff, w: box.w - x0 - pad - legendW, h: availH },
      labelSizePx,
      measure,
      pad,
      seriesColor
    );
    return node;
  }
  function buildHBarNode(id, sourceId, model, box, vp, metrics, media) {
    const pointFill = pointFillResolver(vp, media);
    const grouping = model.grouping ?? "clustered";
    const stacked = grouping === "stacked" || grouping === "percentStacked";
    const node = emptyChartNode(id, sourceId, box);
    const labelSizePx = ptToPx(model.valAxis?.labelSizePt ?? chartTextPt(model), vp.scale);
    const labelColor = model.valAxis?.labelColor ?? chartLabelDefault(model);
    const valLabelsOff = !!model.valAxis?.hidden || !!model.valAxis?.tickLblHidden || !!model.valAxis?.tickLblGarbage;
    const valNoReserve = !!model.valAxis?.hidden || !!model.valAxis?.tickLblHidden;
    const catLabelSizePx = ptToPx(
      model.catAxis?.labelSizePt ?? model.valAxis?.labelSizePt ?? chartTextPt(model),
      vp.scale
    );
    const catLabelColor = model.catAxis?.labelColor ?? labelColor;
    const style = (sizePx) => ({
      fontFamily: chartFont(model),
      fontSizePx: sizePx,
      bold: false,
      italic: false
    });
    const measure = (text, sizePx) => metrics.measure(text, style(sizePx));
    const palette = chartPalette(model);
    const seriesColor = (i) => model.series[i]?.color ?? palette[(model.series[i]?.paletteIdx ?? i) % palette.length];
    const allVals = model.series.flatMap((s) => s.values.filter((v) => v != null));
    if (!allVals.length) return null;
    const catCount = arrayMax(
      model.series.map((s) => s.values.length),
      Math.max(model.categories.length, 1)
    );
    const catAbsTotals = Array.from(
      { length: catCount },
      (_, i) => model.series.reduce((a, s) => a + Math.abs(s.values[i] ?? 0), 0)
    );
    const valueAt = (si, i) => {
      const v = model.series[si]?.values[i];
      if (v == null) return null;
      if (grouping !== "percentStacked") return v;
      return v / (catAbsTotals[i] || 1) * 100;
    };
    let dataMax;
    let dataMin;
    if (stacked) {
      const posSums = Array.from(
        { length: catCount },
        (_, i) => model.series.reduce((a, _s, si) => a + Math.max(valueAt(si, i) ?? 0, 0), 0)
      );
      const negSums = Array.from(
        { length: catCount },
        (_, i) => model.series.reduce((a, _s, si) => a + Math.min(valueAt(si, i) ?? 0, 0), 0)
      );
      dataMax = arrayMax(posSums, 0);
      dataMin = arrayMin(negSums, 0);
    } else {
      dataMax = arrayMax(allVals, 0);
      dataMin = arrayMin(allVals, 0);
    }
    if (grouping === "percentStacked") {
      dataMax = 100;
      dataMin = dataMin < 0 ? -100 : 0;
    }
    const maxIntervalsH = Math.max(2, Math.min(8, Math.floor(box.w / (labelSizePx * 4.5))));
    const { min, max, ticks } = ppTicks(
      model.valAxis?.min ?? dataMin,
      model.valAxis?.max ?? dataMax,
      model.valAxis?.min == null && grouping !== "percentStacked",
      model.valAxis?.max == null && grouping !== "percentStacked",
      true,
      maxIntervalsH,
      false,
      model.valAxis?.majorUnit
    );
    const pad = Math.max(4, box.w * 0.01);
    const legendPos = model.legendPos;
    const legendH = legendPos === "t" || legendPos === "b" ? labelSizePx * 1.6 : 0;
    const catLabelsOff = !!model.catAxis?.hidden || !!model.catAxis?.tickLblHidden || !!model.catAxis?.tickLblGarbage;
    const catNoReserve = !!model.catAxis?.hidden || !!model.catAxis?.tickLblHidden;
    const catLabelW = catNoReserve ? 0 : arrayMax(
      model.categories.map((c) => measure(c, catLabelSizePx)),
      0
    );
    const axisTitleStyle = (a, dflt) => ({
      fontFamily: chartFont(model),
      fontSizePx: a?.titleSizePt ? ptToPx(a.titleSizePt, vp.scale) : dflt,
      bold: !!a?.titleBold,
      italic: !!a?.titleItalic
    });
    const catTitleStyle = axisTitleStyle(model.catAxis, catLabelSizePx);
    const valTitleStyle = axisTitleStyle(model.valAxis, labelSizePx);
    const catTitleW = model.catAxis?.title && !model.catAxis.titleOverlay ? catTitleStyle.fontSizePx * 1.2 + 8 : 0;
    const valTitleH = model.valAxis?.title && !model.valAxis.titleOverlay ? valTitleStyle.fontSizePx * 1.2 + labelSizePx * 0.4 : 0;
    const plotX = pad + catTitleW + Math.min(catLabelW, box.w * 0.35) + 8;
    const plotY = pad + (legendPos === "t" ? legendH + 4 : 0) + labelSizePx * 0.6;
    const legendW = (legendPos === "r" || legendPos === "l" || legendPos === "tr") && !model.legendOverlay && model.series.some((s) => s.name) ? labelSizePx * 0.5 + 4 + arrayMax(
      model.series.map((s) => measure(s.name ?? "", labelSizePx)),
      0
    ) + 8 : 0;
    const plotR = box.w - pad - labelSizePx * 0.7 - legendW;
    const plotB = box.h - pad - valTitleH - labelSizePx * (valNoReserve ? 0.5 : 2) - (legendPos === "b" ? legendH : 0);
    const L2 = model.plotLayout;
    const plot = L2 ? {
      x: L2.x * box.w,
      y: L2.y * box.h,
      w: Math.max(L2.w * box.w, 10),
      h: Math.max(L2.h * box.h, 10)
    } : {
      x: plotX,
      y: plotY,
      w: Math.max(plotR - plotX, 10),
      h: Math.max(plotB - plotY, 10)
    };
    const rev = !!model.valAxis?.reversed;
    const xOf = (v) => {
      const f = (v - min) / (max - min || 1);
      return plot.x + plot.w * (rev ? 1 - f : f);
    };
    const gridColor = majorGridColor(model.valAxis, model);
    const tickLabels = ticks.map((t) => grouping === "percentStacked" ? `${fmtNum(t)}%` : fmtNum(t));
    ticks.forEach((t, i) => {
      const x = xOf(t);
      if (gridColor && t !== min) {
        node.gridLines.push({
          x1: x,
          y1: plot.y,
          x2: x,
          y2: plot.y + plot.h,
          color: gridColor,
          ...model.valAxis?.gridDash ? { dash: [4, 4] } : {}
        });
      }
      if (valLabelsOff) return;
      const text = tickLabels[i];
      node.labels.push({
        text,
        x: x - measure(text, labelSizePx) / 2,
        y: plot.y + plot.h + labelSizePx * 0.75,
        fontSizePx: labelSizePx,
        color: labelColor
      });
    });
    const axisColor = model.valAxis?.lineColor ?? model.catAxis?.lineColor ?? "#888888";
    const axisW = Math.max(1, ptToPx(1, vp.scale));
    node.axisLines.push({
      x1: plot.x,
      y1: plot.y + plot.h,
      x2: plot.x + plot.w,
      y2: plot.y + plot.h,
      color: axisColor,
      widthPx: axisW
    });
    node.axisLines.push({
      x1: plot.x,
      y1: plot.y,
      x2: plot.x,
      y2: plot.y + plot.h,
      color: axisColor,
      widthPx: axisW
    });
    if (model.valAxis?.title) {
      const a = model.valAxis;
      const tw = metrics.measure(a.title, valTitleStyle);
      node.labels.push({
        text: a.title,
        x: plot.x + (plot.w - tw) / 2,
        y: box.h - pad - (legendPos === "b" ? legendH : 0) - valTitleStyle.fontSizePx * 1.2,
        fontSizePx: valTitleStyle.fontSizePx,
        color: a.titleColor ?? labelColor,
        ...a.titleBold ? { bold: true } : {},
        ...a.titleItalic ? { italic: true } : {}
      });
    }
    if (model.catAxis?.title) {
      const a = model.catAxis;
      const tw = metrics.measure(a.title, catTitleStyle);
      node.labels.push({
        text: a.title,
        x: pad,
        y: plot.y + plot.h / 2 + tw / 2,
        fontSizePx: catTitleStyle.fontSizePx,
        color: a.titleColor ?? catLabelColor,
        ...a.titleBold ? { bold: true } : {},
        ...a.titleItalic ? { italic: true } : {},
        rotationDeg: -90
      });
    }
    const n = Math.max(model.categories.length, 1);
    const slotH = plot.h / n;
    const rowY = (i) => {
      const pos = model.catAxis?.reversed ? i : n - 1 - i;
      return plot.y + pos * slotH;
    };
    if (!catLabelsOff)
      model.categories.forEach((cat, i) => {
        node.labels.push({
          text: cat,
          x: plot.x - 8 - measure(cat, catLabelSizePx),
          y: rowY(i) + slotH / 2 - catLabelSizePx * 0.55,
          fontSizePx: catLabelSizePx,
          color: catLabelColor
        });
      });
    const gap = (model.gapWidthPct ?? 150) / 100;
    const dlSize = model.dataLabelPt ? ptToPx(model.dataLabelPt, vp.scale) : labelSizePx * 0.9;
    const dLbl = (si, catIdx, x, yMid, v, inside) => {
      if (!(model.series[si]?.dataLabels ?? model.dataLabels)) return;
      const text = composeDataLabel(model, si, catIdx, fmtDataLabel(v, labelFmt(model, si)));
      if (!text) return;
      const ov = pointLabelOverride(model, si, catIdx);
      const size = ov?.sizePt ? ptToPx(ov.sizePt, vp.scale) : dlSize;
      node.labels.push({
        text,
        x: inside ? x - measure(text, size) / 2 : x,
        y: yMid - size * 0.55,
        fontSizePx: size,
        color: inside ? "#FFFFFF" : ov?.color ?? "#404040",
        ...labelBoxOf(model, si, catIdx, measure(text, size))
      });
    };
    if (stacked) {
      const barH = slotH / (1 + gap);
      for (let i = 0; i < n; i++) {
        const y = rowY(i) + (slotH - barH) / 2;
        let posAcc = 0;
        let negAcc = 0;
        model.series.forEach((ser, si) => {
          const v = valueAt(si, i);
          if (v == null || v === 0) return;
          const from = v > 0 ? posAcc : negAcc;
          const to = from + v;
          if (v > 0) posAcc = to;
          else negAcc = to;
          if (ser.noFill) return;
          const xL = Math.min(xOf(from), xOf(to));
          const xR = Math.max(xOf(from), xOf(to));
          node.bars.push({
            x: xL,
            y,
            w: Math.max(xR - xL, 0.5),
            h: barH,
            color: ser.pointColors?.[i] ?? seriesColor(si),
            ...pointFill(ser.pointFills?.[i])
          });
          dLbl(si, i, (xL + xR) / 2, y + barH / 2, ser.values[i], true);
        });
      }
    } else {
      const sCount = Math.max(model.series.length, 1);
      const ov = Math.max(-1, Math.min(1, (model.overlapPct ?? 0) / 100));
      const barH = slotH / (1 + (1 - ov) * (sCount - 1) + gap);
      const step = barH * (1 - ov);
      const groupH = barH + step * (sCount - 1);
      const base = Math.max(min, 0);
      model.series.forEach((ser, si) => {
        const color = seriesColor(si);
        ser.values.forEach((v, i) => {
          if (v == null || i >= n || ser.noFill) return;
          const slotIdx = model.catAxis?.reversed ? si : sCount - 1 - si;
          const y = rowY(i) + (slotH - groupH) / 2 + slotIdx * step;
          const xL = Math.min(xOf(v), xOf(base));
          const xR = Math.max(xOf(v), xOf(base));
          node.bars.push({
            x: xL,
            y,
            w: Math.max(xR - xL, 0.5),
            h: barH,
            color: ser.pointColors?.[i] ?? color,
            ...pointFill(ser.pointFills?.[i])
          });
          const lblText = composeDataLabel(model, si, i, fmtDataLabel(v, labelFmt(model, si)));
          const tipRight = v >= 0 !== rev;
          dLbl(si, i, tipRight ? xR + 4 : xL - 4 - measure(lblText, dlSize), y + barH / 2, v, false);
        });
      });
    }
    addSeriesLegend(
      node,
      model,
      box,
      plot,
      labelSizePx,
      measure,
      pad,
      seriesColor,
      !model.catAxis?.reversed
    );
    return node;
  }
  function buildScatterNode(id, sourceId, model, box, vp, metrics) {
    const node = emptyChartNode(id, sourceId, box);
    const labelSizePx = ptToPx(model.valAxis?.labelSizePt ?? chartTextPt(model), vp.scale);
    const labelColor = model.valAxis?.labelColor ?? chartLabelDefault(model);
    const yLabelsOff = !!model.valAxis?.hidden || !!model.valAxis?.tickLblHidden || !!model.valAxis?.tickLblGarbage;
    const xLabelsOff = !!model.catAxis?.hidden || !!model.catAxis?.tickLblHidden || !!model.catAxis?.tickLblGarbage;
    const style = (sizePx) => ({
      fontFamily: chartFont(model),
      fontSizePx: sizePx,
      bold: false,
      italic: false
    });
    const measure = (text, sizePx) => metrics.measure(text, style(sizePx));
    const palette = chartPalette(model);
    const seriesColor = (i) => model.series[i]?.color ?? palette[(model.series[i]?.paletteIdx ?? i) % palette.length];
    const points = model.series.map(
      (s) => s.values.map((y, i) => ({ x: s.xValues?.[i] ?? i + 1, y, i })).filter((p) => p.x != null && p.y != null)
    );
    const allX = points.flat().map((p) => p.x);
    const allY = points.flat().map((p) => p.y);
    if (!allY.length) return null;
    const hasBubbles = model.series.some((s) => s.bubbleSizes?.length);
    const bubblePad = (lo, hi) => hasBubbles ? (hi - lo) * 0.25 * ((model.bubbleScale ?? 100) / 100) / 2 : 0;
    const xMin = arrayMin(allX, 0);
    const xMax = arrayMax(allX, 0);
    const yMin = arrayMin(allY, 0);
    const yMax = arrayMax(allY, 0);
    const xPad = bubblePad(xMin, xMax);
    const yPad = bubblePad(yMin, yMax);
    const xTicksR = ppTicks(
      model.catAxis?.min ?? xMin - (xMin < 0 ? xPad : 0),
      model.catAxis?.max ?? xMax + xPad,
      model.catAxis?.min == null,
      model.catAxis?.max == null,
      true
    );
    const yTicksR = ppTicks(
      model.valAxis?.min ?? yMin - (yMin < 0 ? yPad : 0),
      model.valAxis?.max ?? yMax + yPad,
      model.valAxis?.min == null,
      model.valAxis?.max == null,
      true
    );
    const pad = Math.max(4, box.w * 0.01);
    const legendPos = model.legendPos;
    const legendH = legendPos === "t" || legendPos === "b" ? labelSizePx * 1.6 : 0;
    const yLabelW = arrayMax(
      yTicksR.ticks.map((t) => measure(fmtNum(t), labelSizePx)),
      0
    );
    const plotX = pad + yLabelW + 10;
    const plotY = pad + (legendPos === "t" ? legendH + 4 : 0) + labelSizePx * 0.6;
    const plotR = box.w - pad - labelSizePx * 0.7;
    const plotB = box.h - pad - labelSizePx * 1.5 - (legendPos === "b" ? legendH : 0);
    const plot = {
      x: plotX,
      y: plotY,
      w: Math.max(plotR - plotX, 10),
      h: Math.max(plotB - plotY, 10)
    };
    const xOf = (v) => plot.x + plot.w * ((v - xTicksR.min) / (xTicksR.max - xTicksR.min || 1));
    const yOf = (v) => plot.y + plot.h * (1 - (v - yTicksR.min) / (yTicksR.max - yTicksR.min || 1));
    const yGrid = model.valAxis?.gridColor;
    yTicksR.ticks.forEach((t) => {
      const y = yOf(t);
      if (yGrid && t !== yTicksR.min) {
        node.gridLines.push({
          x1: plot.x,
          y1: y,
          x2: plot.x + plot.w,
          y2: y,
          color: yGrid,
          ...model.valAxis?.gridDash ? { dash: [4, 4] } : {}
        });
      }
      if (yLabelsOff) return;
      const text = fmtNum(t);
      node.labels.push({
        text,
        x: plot.x - 6 - measure(text, labelSizePx),
        y: y - labelSizePx * 0.55,
        fontSizePx: labelSizePx,
        color: labelColor
      });
    });
    const xGrid = model.catAxis?.gridColor;
    xTicksR.ticks.forEach((t) => {
      const x = xOf(t);
      if (xGrid && t !== xTicksR.min) {
        node.gridLines.push({
          x1: x,
          y1: plot.y,
          x2: x,
          y2: plot.y + plot.h,
          color: xGrid,
          ...model.catAxis?.gridDash ? { dash: [4, 4] } : {}
        });
      }
      if (xLabelsOff) return;
      const text = fmtNum(t);
      node.labels.push({
        text,
        x: x - measure(text, labelSizePx) / 2,
        y: plot.y + plot.h + labelSizePx * 0.35,
        fontSizePx: labelSizePx,
        color: model.catAxis?.labelColor ?? labelColor
      });
    });
    const axisColor = model.valAxis?.lineColor ?? model.catAxis?.lineColor ?? "#888888";
    const axisW = Math.max(1, ptToPx(1, vp.scale));
    node.axisLines.push({
      x1: plot.x,
      y1: plot.y + plot.h,
      x2: plot.x + plot.w,
      y2: plot.y + plot.h,
      color: axisColor,
      widthPx: axisW
    });
    node.axisLines.push({
      x1: plot.x,
      y1: plot.y,
      x2: plot.x,
      y2: plot.y + plot.h,
      color: axisColor,
      widthPx: axisW
    });
    const st = model.scatterStyle ?? "lineMarker";
    const hasLine = st.startsWith("line") || st.startsWith("smooth");
    const smooth = st.startsWith("smooth");
    const defaultMarker = st !== "line" && st !== "smooth" && st !== "none";
    const lineW = defaultLineWidthPx(model, vp.scale);
    const markerR = Math.max(2, ptToPx(3, vp.scale));
    const maxBubbleSize = Math.max(
      ...model.series.flatMap((s) => (s.bubbleSizes ?? []).map((v) => Math.abs(v ?? 0))),
      0
    );
    const maxBubbleR = Math.min(plot.w, plot.h) * 0.25 * ((model.bubbleScale ?? 100) / 100) / 2;
    model.series.forEach((ser, si) => {
      const color = seriesColor(si);
      const pts = points[si];
      const bubbles = ser.bubbleSizes;
      const showMarker = ser.marker ?? defaultMarker;
      const flat = [];
      pts.forEach((p) => {
        const x = xOf(p.x);
        const y = yOf(p.y);
        flat.push(x, y);
        if (bubbles?.length && maxBubbleSize > 0) {
          const size = Math.abs(bubbles[p.i] ?? 0);
          if (size > 0)
            node.markers.push({
              x,
              y,
              r: maxBubbleR * (model.bubbleSizeIsWidth ? size / maxBubbleSize : Math.sqrt(size / maxBubbleSize)),
              color
            });
        } else if (showMarker) node.markers.push({ x, y, r: markerR, color });
        const cellLab = ser.pointLabels?.[p.i];
        if (cellLab) {
          const size = Math.abs(bubbles?.[p.i] ?? 0);
          const r = bubbles?.length && maxBubbleSize > 0 && size > 0 ? maxBubbleR * (model.bubbleSizeIsWidth ? size / maxBubbleSize : Math.sqrt(size / maxBubbleSize)) : markerR;
          node.labels.push({
            text: cellLab,
            x: x + r + 4,
            y: y - labelSizePx * 0.55,
            fontSizePx: labelSizePx * 0.9,
            color: model.defaultTextColor ?? "#404040"
          });
        }
        const text = ser.dataLabels ?? model.dataLabels ? composeDataLabel(model, si, p.i, fmtNum(round12(p.y))) : "";
        if (text) {
          node.labels.push({
            text,
            x: x - measure(text, labelSizePx * 0.9) / 2,
            y: y - labelSizePx * 1.3,
            fontSizePx: labelSizePx * 0.9,
            color: model.defaultTextColor ?? "#404040"
          });
        }
      });
      if (hasLine && !bubbles?.length && flat.length >= 4) {
        node.polylines.push({
          points: flat,
          color,
          widthPx: lineW,
          ...smooth || ser.smooth ? { smooth: true } : {}
        });
      }
    });
    addSeriesLegend(node, model, box, plot, labelSizePx, measure, pad, seriesColor);
    return node;
  }
  function buildFunnelNode(id, sourceId, model, box, vp, metrics) {
    const vals = model.series[0]?.values;
    if (!vals?.length) return null;
    const maxVal = arrayMax(vals.map((v) => Math.abs(v ?? 0)));
    if (maxVal <= 0) return null;
    const node = emptyChartNode(id, sourceId, box);
    const labelSizePx = ptToPx(chartTextPt(model), vp.scale) * 0.9;
    const style = {
      fontFamily: chartFont(model),
      fontSizePx: labelSizePx,
      bold: false,
      italic: false
    };
    const measure = (text) => metrics.measure(text, style);
    const color = model.series[0].color ?? chartPalette(model)[0];
    const pad = Math.max(6, Math.min(box.w, box.h) * 0.03);
    const labelW = arrayMax(
      model.categories.map((c) => measure(c)),
      0
    );
    const plotX = pad + labelW + labelSizePx;
    const plotW = box.w - plotX - pad;
    const plotH = box.h - pad * 2;
    const n = vals.length;
    const slotH = plotH / n;
    const gapFrac = (model.gapWidthPct ?? 6) / 100;
    const barH = slotH / (1 + gapFrac);
    vals.forEach((v, i) => {
      const y = pad + i * slotH + (slotH - barH) / 2;
      const cat = model.categories[i] ?? "";
      if (cat) {
        node.labels.push({
          text: cat,
          x: pad + labelW - measure(cat),
          y: y + barH / 2 - labelSizePx * 0.6,
          fontSizePx: labelSizePx,
          color: "#595959"
        });
      }
      if (v == null || v <= 0) return;
      const w = plotW * v / maxVal;
      node.bars.push({ x: plotX + (plotW - w) / 2, y, w, h: barH, color });
    });
    return node;
  }
  function buildSunburstNode(id, sourceId, model, box, vp, metrics) {
    const sb = model.sunburst;
    if (!sb) return null;
    const node = emptyChartNode(id, sourceId, box);
    node.wedges = [];
    const root = { label: "", depth: 0, value: 0, children: [] };
    const depth = sb.levels.length;
    const n = sb.sizes.length;
    for (let i = 0; i < n; i++) {
      const size = Math.abs(sb.sizes[i] ?? 0);
      if (size <= 0) continue;
      let cur = root;
      for (let d = 0; d < depth; d++) {
        const label = sb.levels[depth - 1 - d]?.[i] ?? "";
        if (!label) break;
        let child = cur.children.find((c) => c.label === label);
        if (!child) {
          child = { label, depth: d + 1, value: 0, children: [] };
          cur.children.push(child);
        }
        child.value += size;
        cur = child;
      }
      cur.point ??= i;
      cur.value ||= size;
    }
    if (root.children.length === 0) return null;
    root.value = root.children.reduce((a2, c) => a2 + c.value, 0);
    const sortRec = (t) => {
      t.children.sort((a2, b) => b.value - a2.value);
      t.children.forEach(sortRec);
    };
    sortRec(root);
    const labelSizePx = ptToPx(chartTextPt(model), vp.scale) * 0.8;
    const style = {
      fontFamily: chartFont(model),
      fontSizePx: labelSizePx,
      bold: false,
      italic: false
    };
    const measure = (text) => metrics.measure(text, style);
    const palette = chartPalette(model);
    const rootColors = /* @__PURE__ */ new Map();
    const rootLvl = sb.levels[depth - 1] ?? [];
    for (const label of rootLvl) {
      if (label && !rootColors.has(label))
        rootColors.set(label, palette[rootColors.size % palette.length]);
    }
    const pad = Math.max(4, Math.min(box.w, box.h) * 0.02);
    const R = Math.max(Math.min(box.w, box.h) / 2 - pad, 5);
    const cx = box.w / 2;
    const cy = box.h / 2;
    const maxDepth = (t) => Math.max(t.depth, ...t.children.map(maxDepth));
    const rings = Math.max(maxDepth(root), 1);
    const holeR = R * 0.2;
    const ringT = (R - holeR) / rings;
    const drawNode = (t, startDeg, sweepDeg, color) => {
      const override = t.point != null ? sb.pointColors?.[t.point] : void 0;
      const fill = override ?? color;
      if (!(override != null && /^#[0-9A-F]{6}00$/i.test(override))) {
        node.wedges.push({
          cx,
          cy,
          innerR: holeR + (t.depth - 1) * ringT,
          outerR: holeR + t.depth * ringT,
          startDeg,
          sweepDeg,
          color: fill
        });
        const midR = holeR + (t.depth - 0.5) * ringT;
        const midDeg = startDeg + sweepDeg / 2;
        const w = measure(t.label);
        const arcLen = Math.abs(sweepDeg) / 360 * 2 * Math.PI * midR;
        if (t.label && w < arcLen * 0.9 && labelSizePx < ringT * 0.9) {
          let rot = midDeg + 90;
          while (rot > 90) rot -= 180;
          while (rot < -90) rot += 180;
          const rad2 = rot * Math.PI / 180;
          const px = cx + midR * Math.cos(midDeg * Math.PI / 180);
          const py = cy + midR * Math.sin(midDeg * Math.PI / 180);
          node.labels.push({
            text: t.label,
            x: px - w / 2 * Math.cos(rad2) + labelSizePx / 2 * Math.sin(rad2),
            y: py - w / 2 * Math.sin(rad2) - labelSizePx / 2 * Math.cos(rad2),
            fontSizePx: labelSizePx,
            color: "#FFFFFF",
            rotationDeg: rot
          });
        }
      }
      let a2 = startDeg;
      for (const c of t.children) {
        const s = c.value / t.value * sweepDeg;
        drawNode(c, a2, s, t.depth === 0 ? rootColors.get(c.label) ?? palette[0] : fill);
        a2 += s;
      }
    };
    let a = -90;
    for (const c of root.children) {
      const s = c.value / root.value * 360;
      drawNode(c, a, s, rootColors.get(c.label) ?? palette[0]);
      a += s;
    }
    return node;
  }
  function buildRadarNode(id, sourceId, model, box, vp, metrics) {
    const n = arrayMax(
      model.series.map((s) => s.values.length),
      model.categories.length
    );
    if (n < 3) return null;
    const allVals = model.series.flatMap((s) => s.values.filter((v) => v != null));
    if (!allVals.length) return null;
    const node = emptyChartNode(id, sourceId, box);
    const labelSizePx = ptToPx(model.valAxis?.labelSizePt ?? chartTextPt(model), vp.scale);
    const labelColor = model.valAxis?.labelColor ?? chartLabelDefault(model);
    const catLabelColor = model.catAxis?.labelColor ?? labelColor;
    const style = (sizePx) => ({
      fontFamily: chartFont(model),
      fontSizePx: sizePx,
      bold: false,
      italic: false
    });
    const measure = (text, sizePx) => metrics.measure(text, style(sizePx));
    const palette = chartPalette(model);
    const seriesColor = (i) => model.series[i]?.color ?? palette[(model.series[i]?.paletteIdx ?? i) % palette.length];
    const { min, max, ticks } = ppTicks(
      model.valAxis?.min ?? arrayMin(allVals, 0),
      model.valAxis?.max ?? arrayMax(allVals, 0),
      model.valAxis?.min == null,
      model.valAxis?.max == null,
      true
    );
    const pad = Math.max(6, Math.min(box.w, box.h) * 0.03);
    const legendPos = model.legendPos;
    const legendH = legendPos === "t" || legendPos === "b" ? labelSizePx * 1.6 : 0;
    const maxCatW = arrayMax(
      model.categories.map((c) => measure(c, labelSizePx)),
      0
    );
    const sideLegendW = legendPos === "l" || legendPos === "r" || legendPos === "tr" ? arrayMax(
      model.series.map((s) => measure(s.name ?? "", labelSizePx)),
      0
    ) + labelSizePx * 2.2 : 0;
    const plotW = box.w - pad * 2 - sideLegendW - maxCatW * 2;
    const plotH = box.h - pad * 2 - legendH - labelSizePx * 2.4;
    const R = Math.max(Math.min(plotW, plotH) / 2, 5);
    const cx = pad + maxCatW + plotW / 2 + (legendPos === "l" ? sideLegendW : 0);
    const cy = pad + labelSizePx * 1.2 + (legendPos === "t" ? legendH : 0) + plotH / 2;
    const plot = { x: cx - R, y: cy - R, w: R * 2, h: R * 2 };
    const angleOf = (i) => -Math.PI / 2 + i / n * Math.PI * 2;
    const rOf = (v) => R * (v - min) / (max - min || 1);
    const ptAt = (i, v) => {
      const a = angleOf(i);
      const r = rOf(v);
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    };
    const gridColor = model.valAxis?.gridColor ?? "#D9D9D9";
    for (const t of ticks) {
      if (t === min) continue;
      const ring = [];
      for (let i = 0; i < n; i++) ring.push(...ptAt(i, t));
      node.polylines.push({ points: ring, color: gridColor, widthPx: 1, closed: true });
    }
    for (let i = 0; i < n; i++) {
      const [x, y] = ptAt(i, max);
      node.gridLines.push({ x1: cx, y1: cy, x2: x, y2: y, color: gridColor });
    }
    for (const t of ticks) {
      const [x, y] = ptAt(0, t);
      const text = fmtNum(t);
      node.labels.push({
        text,
        x: x - measure(text, labelSizePx) - 4,
        y: y - labelSizePx * 0.55,
        fontSizePx: labelSizePx * 0.9,
        color: labelColor
      });
    }
    model.categories.forEach((cat, i) => {
      const a = angleOf(i);
      const lx = cx + Math.cos(a) * (R + labelSizePx * 0.5);
      const ly = cy + Math.sin(a) * (R + labelSizePx * 0.5);
      const w = measure(cat, labelSizePx);
      const alignX = Math.cos(a) > 0.3 ? lx : Math.cos(a) < -0.3 ? lx - w : lx - w / 2;
      const alignY = Math.sin(a) > 0.3 ? ly : Math.sin(a) < -0.3 ? ly - labelSizePx : ly - labelSizePx * 0.55;
      node.labels.push({
        text: cat,
        x: alignX,
        y: alignY,
        fontSizePx: labelSizePx,
        color: catLabelColor
      });
    });
    const filled = model.radarStyle === "filled";
    const markerDefault = model.radarStyle === "marker";
    const lineW = Math.max(1.5, ptToPx(1.5, vp.scale));
    const markerR = Math.max(2, ptToPx(3, vp.scale));
    model.series.forEach((ser, si) => {
      const color = seriesColor(si);
      const flat = [];
      for (let i = 0; i < n; i++) {
        const v = ser.values[i];
        if (v == null) continue;
        const [x, y] = ptAt(i, v);
        flat.push(x, y);
        if (ser.marker ?? markerDefault) node.markers.push({ x, y, r: markerR, color });
      }
      if (flat.length >= 6) {
        node.polylines.push({
          points: flat,
          color,
          widthPx: lineW,
          closed: true,
          ...filled ? { fill: withAlpha(color, 0.4) } : {}
        });
      }
    });
    addSeriesLegend(node, model, box, plot, labelSizePx, measure, pad, seriesColor);
    return node;
  }
  function emptyChartNode(id, sourceId, box) {
    return {
      id,
      type: "chart",
      box,
      sourceId,
      gridLines: [],
      axisLines: [],
      labels: [],
      bars: [],
      polylines: [],
      markers: [],
      swatches: []
    };
  }
  function addSeriesLegend(node, model, box, plot, labelSizePx, measure, pad, seriesColor, reverse = false) {
    const legendPos = model.legendPos;
    if (!legendPos || !model.series.some((s) => s.name)) return;
    const sw = labelSizePx * 0.5;
    const items = (model.legendOrder ?? model.series.map((_, i) => i)).map((i) => ({
      label: model.series[i]?.name ?? "",
      color: seriesColor(i)
    }));
    if (reverse && !model.legendOrder) items.reverse();
    const itemWs = items.map((it) => sw + 4 + measure(it.label, labelSizePx) + labelSizePx * 0.5);
    const labelColor = model.valAxis?.labelColor ?? chartLabelDefault(model);
    if (legendPos === "t" || legendPos === "b") {
      const total = itemWs.reduce((a, b) => a + b, 0);
      let x = Math.max((box.w - total) / 2, pad);
      const y = legendPos === "t" ? pad : box.h - pad - labelSizePx * 1.2;
      items.forEach((it, i) => {
        node.swatches.push({
          x,
          y: y + labelSizePx * 0.3,
          w: sw,
          h: labelSizePx * 0.5,
          color: it.color
        });
        node.labels.push({
          text: it.label,
          x: x + sw + 4,
          y,
          fontSizePx: labelSizePx,
          color: labelColor
        });
        x += itemWs[i];
      });
    } else {
      let y = plot.y;
      const x = plot.x + plot.w + 8;
      items.forEach((it) => {
        node.swatches.push({
          x,
          y: y + labelSizePx * 0.3,
          w: sw,
          h: labelSizePx * 0.5,
          color: it.color
        });
        node.labels.push({
          text: it.label,
          x: x + sw + 4,
          y,
          fontSizePx: labelSizePx,
          color: labelColor
        });
        y += labelSizePx * 1.5;
      });
    }
  }
  function withAlpha(hex, alpha) {
    const m = /^#([0-9a-fA-F]{6})/.exec(hex);
    if (!m) return hex;
    const v = parseInt(m[1], 16);
    return `rgba(${v >> 16 & 255}, ${v >> 8 & 255}, ${v & 255}, ${alpha})`;
  }
  function ppTicks(rawMin, rawMax, autoMin, autoMax, legacy = false, maxIntervals, noHeadroom = false, majorUnit) {
    let lo = autoMin ? Math.min(rawMin, 0) : rawMin;
    let hi = rawMax;
    if (hi <= lo) hi = lo + 1;
    const span0 = hi - lo;
    const hiT = autoMax && hi > 0 && !noHeadroom ? hi + span0 * 0.05 : hi;
    const loT = autoMin && lo < 0 ? lo - span0 * 0.05 : lo;
    const unit = majorUnit && (hiT - loT) / majorUnit <= 200 ? majorUnit : void 0;
    let step = unit ?? (legacy ? ppUnitLegacy((hiT - loT) / 8) : ppUnit(hiT - loT));
    if (maxIntervals && !unit) {
      while (Math.ceil((hiT - loT) / step) > maxIntervals) step = ppUnitUp(step);
    }
    if (autoMin) lo = Math.floor(loT / step) * step;
    if (autoMax) hi = Math.ceil(hiT / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step * 1e-6; v += step) ticks.push(round12(v));
    return { min: lo, max: hi, ticks };
  }
  function logTicks(posDataMin, dataMax, explicitMin, explicitMax, base) {
    const lg = (v) => Math.log(v) / Math.log(base);
    const lo = explicitMin && explicitMin > 0 ? explicitMin : base ** Math.floor(lg(Number.isFinite(posDataMin) && posDataMin > 0 ? posDataMin : 1) + 1e-9);
    let hi = explicitMax && explicitMax > lo ? explicitMax : base ** Math.ceil(lg(Math.max(dataMax, lo * base)) - 1e-9);
    if (hi <= lo) hi = lo * base;
    const ticks = [];
    if (Math.abs(lg(lo) - Math.round(lg(lo))) > 1e-9) ticks.push(lo);
    for (let e = Math.ceil(lg(lo) - 1e-9); base ** e <= hi * (1 + 1e-9); e++)
      ticks.push(round12(base ** e));
    return { min: lo, max: hi, ticks };
  }
  function logMinors(min, max, base) {
    const out = [];
    const e0 = Math.floor(Math.log(min) / Math.log(base) + 1e-9);
    for (let e = e0; base ** e < max; e++)
      for (let k = 2; k < base; k++) {
        const v = k * base ** e;
        if (v > min * (1 + 1e-9) && v < max * (1 - 1e-9)) out.push(round12(v));
      }
    return out;
  }
  function ppUnitLegacy(x) {
    const exp = Math.floor(Math.log10(Math.max(x, 1e-12)));
    const f = x / 10 ** exp;
    const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return nf * 10 ** exp;
  }
  function ppUnit(range) {
    const p = 10 ** Math.floor(Math.log10(Math.max(range, 1e-12)));
    const ratio = range / p;
    return ratio >= 5 ? p : ratio >= 2 ? p / 2 : p / 5;
  }
  function ppUnitUp(s) {
    const exp = Math.floor(Math.log10(Math.max(s, 1e-12)));
    const f = s / 10 ** exp;
    return (f < 1.5 ? 2 : f < 3.5 ? 5 : 10) * 10 ** exp;
  }
  function round12(v) {
    return Math.round(v * 1e12) / 1e12;
  }
  function labelFmt(model, si) {
    return model.series[si]?.dataLabelFmt ?? model.dataLabelFmt;
  }
  function labelBoxOf(model, si, catIdx, textW) {
    const s = model.series[si];
    const ov = s?.dLblOverrides?.find((o) => o.idx === catIdx);
    const fill = ov && ov.fill !== void 0 ? ov.fill : s?.dataLabelFill;
    const stroke = ov && ov.border !== void 0 ? ov.border : s?.dataLabelBorder;
    if (!fill && !stroke) return {};
    return { ...fill ? { fill } : {}, ...stroke ? { stroke } : {}, w: textW };
  }
  function composeDataLabel(model, si, catIdx, valueText) {
    const ov = pointLabelOverride(model, si, catIdx);
    if (ov?.hidden) return "";
    const parts = [];
    if (ov ? ov.ser : model.dataLabelSerName) parts.push(model.series[si]?.name ?? "");
    if (ov ? ov.cat : model.dataLabelCatName) parts.push(model.categories?.[catIdx] ?? "");
    if (ov ? ov.val || ov.pct : !model.dataLabelNoValue) parts.push(valueText);
    return parts.filter(Boolean).join(", ");
  }
  function pointLabelOverride(model, si, idx) {
    const ser = model.series[si];
    const ov = ser?.dLblOverrides?.find((o) => o.idx === idx);
    if (ov) return ov;
    return ser?.dLblOnlyPoints ? { idx, hidden: true } : void 0;
  }
  function fmtDataLabel(v, code) {
    if (!code) return fmtNum(round12(v));
    const m = /^([#,0]*0)(?:\.(0+))?(%?)(?:;.*)?$/.exec(code.replace(/"[^"]*"/g, "").trim());
    if (!m) return fmtNum(round12(v));
    const dec = m[2]?.length ?? 0;
    const pct = m[3] === "%";
    const scaled = pct ? v * 100 : v;
    const text = m[1].includes(",") ? Number(scaled.toFixed(dec)).toLocaleString("en-US", {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec
    }) : scaled.toFixed(dec);
    return pct ? `${text}%` : text;
  }
  function fmtNum(v) {
    if (v === 0) return "0";
    if (Number.isInteger(v)) return v.toLocaleString("en-US");
    return String(v);
  }

  // ../genoffice/packages/pptx-render/src/cell-bevel.ts
  var FACE_FACTOR = 0.85;
  var DIR_DEG = {
    t: 0,
    tr: 45,
    r: 90,
    br: 135,
    b: 180,
    bl: 225,
    l: 270,
    tl: 315
  };
  var LIGHT_SKEW_DEG = -60;
  var EDGE_NORMAL_DEG = { t: 0, r: 90, b: 180, l: 270 };
  var AMPLITUDE = [
    [-1, -0.62],
    [-0.87, -0.6],
    [-0.5, -0.11],
    [0, 0],
    [0.5, 0.35],
    [0.87, 1.6],
    [1, 1.7]
  ];
  var FLAT_PRESETS = /* @__PURE__ */ new Set(["angle", "hardEdge", "slope"]);
  function parseHex(hex) {
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function alphaOf(hex) {
    const h = hex.replace("#", "");
    return h.length === 8 ? h.slice(6, 8).toUpperCase() : "";
  }
  function toHex(rgb, alpha) {
    return "#" + rgb.map(
      (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")
    ).join("").toUpperCase() + alpha;
  }
  function scale(rgb, k, alpha) {
    return toHex([rgb[0] * k, rgb[1] * k, rgb[2] * k], alpha);
  }
  function amplitude(lit) {
    for (let i = 1; i < AMPLITUDE.length; i++) {
      const [x0, y0] = AMPLITUDE[i - 1];
      const [x1, y1] = AMPLITUDE[i];
      if (lit <= x1) return y0 + (lit - x0) / (x1 - x0) * (y1 - y0);
    }
    return AMPLITUDE[AMPLITUDE.length - 1][1];
  }
  function bevelFaceColor(fill) {
    return scale(parseHex(fill), FACE_FACTOR, alphaOf(fill));
  }
  function buildCellBevel(fill, widthPx, preset, lightDir) {
    const face = parseHex(bevelFaceColor(fill));
    const alpha = alphaOf(fill);
    const light = (DIR_DEG[lightDir ?? "t"] ?? 0) + LIGHT_SKEW_DEG;
    const flat = FLAT_PRESETS.has(preset ?? "circle");
    const edges = {};
    for (const e of ["t", "r", "b", "l"]) {
      const lit = Math.cos((EDGE_NORMAL_DEG[e] - light) * Math.PI / 180);
      const peak = 1 + amplitude(lit);
      edges[e] = flat ? [
        { pos: 0, color: scale(face, peak, alpha) },
        { pos: 0.95, color: scale(face, peak, alpha) },
        { pos: 1, color: toHex(face, alpha) }
      ] : [
        { pos: 0, color: scale(face, peak, alpha) },
        { pos: 0.45, color: scale(face, peak, alpha) },
        { pos: 0.95, color: toHex(face, alpha) },
        { pos: 1, color: toHex(face, alpha) }
      ];
    }
    return { widthPx, edges };
  }

  // ../genoffice/packages/pptx-render/src/preset-geometry.ts
  var CONNECTOR_RE = /^(line|straightConnector\d?|bentConnector\d|curvedConnector\d)$/;
  function isConnectorPreset(preset) {
    return !!preset && CONNECTOR_RE.test(preset);
  }
  function connectorPoints(preset, w, h, flipH, flipV, adjust) {
    let pts;
    if (/^bentConnector|^curvedConnector/.test(preset)) {
      pts = bentConnectorPts(preset, w, h, adjust);
    } else {
      pts = [0, 0, w, h];
    }
    if (flipH) for (let i = 0; i < pts.length; i += 2) pts[i] = w - pts[i];
    if (flipV) for (let i = 1; i < pts.length; i += 2) pts[i] = h - pts[i];
    return pts;
  }
  function bentConnectorPts(preset, w, h, adjust) {
    const n = parseInt(preset.slice(-1), 10) || 2;
    const clamp = (v, lo = -2, hi = 3) => Math.min(Math.max(v, lo), hi);
    const adj = (name, dflt) => adjust?.[name] != null ? clamp(adjust[name] / 1e5) : dflt;
    if (n <= 2) {
      return [0, 0, w, 0, w, h];
    } else if (n === 3) {
      const a1 = adj("adj1", 0.5);
      const mx = w * a1;
      return [0, 0, mx, 0, mx, h, w, h];
    } else if (n === 4) {
      const a1 = adj("adj1", 0.5);
      const a2 = adj("adj2", 0.5);
      const mx = w * a1;
      const my = h * a2;
      return [0, 0, mx, 0, mx, my, w, my, w, h];
    } else {
      const a1 = adj("adj1", 0.333);
      const a2 = adj("adj2", 0.5);
      const a3 = adj("adj3", 0.667);
      const x1 = w * a1;
      const y1 = h * a2;
      const x2 = w * a3;
      return [0, 0, x1, 0, x1, y1, x2, y1, x2, h, w, h];
    }
  }
  function connectorBezier(pts) {
    const nPts = pts.length / 2;
    if (nPts < 3) return [];
    const bezier = [];
    for (let i = 1; i < nPts; i++) {
      const x0 = pts[(i - 1) * 2];
      const y0 = pts[(i - 1) * 2 + 1];
      const x1 = pts[i * 2];
      const y1 = pts[i * 2 + 1];
      const prevX = i > 1 ? pts[(i - 2) * 2] : x0;
      const prevY = i > 1 ? pts[(i - 2) * 2 + 1] : y0;
      const nextX = i < nPts - 1 ? pts[(i + 1) * 2] : x1;
      const nextY = i < nPts - 1 ? pts[(i + 1) * 2 + 1] : y1;
      const cp1x = x0 + (x1 - prevX) / 6;
      const cp1y = y0 + (y1 - prevY) / 6;
      const cp2x = x1 - (nextX - x0) / 6;
      const cp2y = y1 - (nextY - y0) / 6;
      bezier.push(cp1x, cp1y, cp2x, cp2y, x1, y1);
    }
    return bezier;
  }
  function presetPolygon(preset, w, h, adjust) {
    if (!preset || w <= 0 || h <= 0) return null;
    const ss = Math.min(w, h);
    const frac = (name, dflt) => Math.min(Math.max((adjust?.[name] ?? dflt) / 1e5, 0), 1);
    switch (preset) {
      case "triangle": {
        const apex = w * frac("adj", 5e4);
        return [apex, 0, w, h, 0, h];
      }
      case "rtTriangle":
        return [0, 0, w, h, 0, h];
      case "diamond":
      case "flowChartDecision":
        return [w / 2, 0, w, h / 2, w / 2, h, 0, h / 2];
      case "parallelogram": {
        const inset = ss * frac("adj", 25e3);
        return [inset, 0, w, 0, w - inset, h, 0, h];
      }
      case "trapezoid": {
        const inset = ss * frac("adj", 25e3);
        return [inset, 0, w - inset, 0, w, h, 0, h];
      }
      case "pentagon": {
        return [w / 2, 0, w, h * 0.382, w * 0.809, h, w * 0.191, h, 0, h * 0.382];
      }
      case "hexagon": {
        const inset = ss * frac("adj", 25e3);
        return [inset, 0, w - inset, 0, w, h / 2, w - inset, h, inset, h, 0, h / 2];
      }
      case "octagon": {
        const c = ss * frac("adj", 29289);
        return [c, 0, w - c, 0, w, c, w, h - c, w - c, h, c, h, 0, h - c, 0, c];
      }
      case "mathPlus": {
        const t = ss * frac("adj1", 23520);
        const dx = w * 73490 / 2e5;
        const dy = h * 73490 / 2e5;
        const hc = w / 2;
        const vc = h / 2;
        const x1 = hc - dx;
        const x2 = hc - t;
        const x3 = hc + t;
        const x4 = hc + dx;
        const y1 = vc - dy;
        const y2 = vc - t;
        const y3 = vc + t;
        const y4 = vc + dy;
        return [x1, y2, x2, y2, x2, y1, x3, y1, x3, y2, x4, y2, x4, y3, x3, y3, x3, y4, x2, y4, x2, y3, x1, y3];
      }
      case "mathNotEqual": {
        const a1 = Math.min(frac("adj1", 23520), 0.5);
        const crAng = Math.min(Math.max(adjust?.adj2 ?? 66e5, 42e5), 66e5);
        const a3 = Math.min(frac("adj3", 11760), 1 - 2 * a1);
        const dy1 = h * a1;
        const dy2 = h * a3 / 2;
        const dx1 = w * 73490 / 2e5;
        const hc = w / 2;
        const vc = h / 2;
        const hd2 = h / 2;
        const x1 = hc - dx1;
        const x8 = hc + dx1;
        const y2 = vc - dy2;
        const y3 = vc + dy2;
        const y1 = y2 - dy1;
        const y4 = y3 + dy1;
        const cadj2 = (crAng - 54e5) / 6e4;
        const xadj2 = hd2 * Math.tan(cadj2 * D2R);
        const len = Math.hypot(xadj2, hd2);
        const bhw = len * dy1 / hd2;
        const x7 = hc + xadj2 - bhw / 2;
        const x6 = x7 - xadj2 * y1 / hd2;
        const x5 = x7 - xadj2 * y2 / hd2;
        const x4 = x7 - xadj2 * y3 / hd2;
        const x3 = x7 - xadj2 * y4 / hd2;
        const rx6 = x6 + bhw;
        const rx5 = x5 + bhw;
        const rx4 = x4 + bhw;
        const rx3 = x3 + bhw;
        const rx7 = x7 + bhw;
        const dx7 = dy1 * hd2 / len;
        const dy3 = dy1 * xadj2 / len;
        const rx = cadj2 > 0 ? x7 + dx7 : rx7;
        const lx = cadj2 > 0 ? x7 : rx7 - dx7;
        const ry = cadj2 > 0 ? dy3 : 0;
        const ly = cadj2 > 0 ? 0 : -dy3;
        const dlx = w - rx;
        const drx = w - lx;
        const dly = h - ry;
        const dry = h - ly;
        return [
          x1,
          y1,
          x6,
          y1,
          lx,
          ly,
          rx,
          ry,
          rx6,
          y1,
          x8,
          y1,
          x8,
          y2,
          rx5,
          y2,
          rx4,
          y3,
          x8,
          y3,
          x8,
          y4,
          rx3,
          y4,
          drx,
          dry,
          dlx,
          dly,
          x3,
          y4,
          x1,
          y4,
          x1,
          y3,
          x4,
          y3,
          x5,
          y2,
          x1,
          y2
        ];
      }
      case "plus": {
        const a = ss * frac("adj", 25e3);
        const x1 = a;
        const x2 = w - a;
        const y1 = a;
        const y2 = h - a;
        return [
          x1,
          0,
          x2,
          0,
          x2,
          y1,
          w,
          y1,
          w,
          y2,
          x2,
          y2,
          x2,
          h,
          x1,
          h,
          x1,
          y2,
          0,
          y2,
          0,
          y1,
          x1,
          y1
        ];
      }
      case "rightArrow": {
        const thick = h * frac("adj1", 5e4);
        const head = Math.min(w, ss * frac("adj2", 5e4));
        const y1 = (h - thick) / 2;
        const y2 = (h + thick) / 2;
        const xh = w - head;
        return [0, y1, xh, y1, xh, 0, w, h / 2, xh, h, xh, y2, 0, y2];
      }
      case "notchedRightArrow": {
        const thick = h * frac("adj1", 5e4);
        const head = Math.min(w, ss * frac("adj2", 5e4));
        const y1 = (h - thick) / 2;
        const y2 = (h + thick) / 2;
        const xh = w - head;
        const notch = head * thick / h;
        return [0, y1, xh, y1, xh, 0, w, h / 2, xh, h, xh, y2, 0, y2, notch, h / 2];
      }
      case "leftArrow": {
        const thick = h * frac("adj1", 5e4);
        const head = Math.min(w, ss * frac("adj2", 5e4));
        const y1 = (h - thick) / 2;
        const y2 = (h + thick) / 2;
        return [w, y1, head, y1, head, 0, 0, h / 2, head, h, head, y2, w, y2];
      }
      case "upArrow": {
        const thick = w * frac("adj1", 5e4);
        const head = Math.min(h, ss * frac("adj2", 5e4));
        const x1 = (w - thick) / 2;
        const x2 = (w + thick) / 2;
        return [x1, h, x1, head, 0, head, w / 2, 0, w, head, x2, head, x2, h];
      }
      case "downArrow": {
        const thick = w * frac("adj1", 5e4);
        const head = Math.min(h, ss * frac("adj2", 5e4));
        const x1 = (w - thick) / 2;
        const x2 = (w + thick) / 2;
        const yh = h - head;
        return [x1, 0, x1, yh, 0, yh, w / 2, h, w, yh, x2, yh, x2, 0];
      }
      // Arrow callouts: a callout box on one side with an arrow (shaft + head) growing
      // out of the opposite side (ECMA guide formulas; adj4 = box extent)
      case "upArrowCallout":
      case "downArrowCallout": {
        const fracU = (name, dflt) => Math.max((adjust?.[name] ?? dflt) / 1e5, 0);
        const a2 = Math.min(fracU("adj2", 25e3), 0.5 * w / ss);
        const a1 = Math.min(fracU("adj1", 25e3), a2 * 2);
        const a3 = Math.min(fracU("adj3", 25e3), h / ss);
        const a4 = Math.min(fracU("adj4", 64977), 1 - a3 * ss / h);
        const headHalf = ss * a2;
        const shaftHalf = ss * a1 / 2;
        const x1 = w / 2 - headHalf;
        const x2 = w / 2 - shaftHalf;
        const x3 = w / 2 + shaftHalf;
        const x4 = w / 2 + headHalf;
        if (preset === "upArrowCallout") {
          const y12 = ss * a3;
          const y22 = h - h * a4;
          return [0, y22, x2, y22, x2, y12, x1, y12, w / 2, 0, x4, y12, x3, y12, x3, y22, w, y22, w, h, 0, h];
        }
        const y1 = h - ss * a3;
        const y2 = h * a4;
        return [0, y2, x2, y2, x2, y1, x1, y1, w / 2, h, x4, y1, x3, y1, x3, y2, w, y2, w, 0, 0, 0];
      }
      case "leftArrowCallout":
      case "rightArrowCallout": {
        const fracU = (name, dflt) => Math.max((adjust?.[name] ?? dflt) / 1e5, 0);
        const a2 = Math.min(fracU("adj2", 25e3), 0.5 * h / ss);
        const a1 = Math.min(fracU("adj1", 25e3), a2 * 2);
        const a3 = Math.min(fracU("adj3", 25e3), w / ss);
        const a4 = Math.min(fracU("adj4", 64977), 1 - a3 * ss / w);
        const headHalf = ss * a2;
        const shaftHalf = ss * a1 / 2;
        const y1 = h / 2 - headHalf;
        const y2 = h / 2 - shaftHalf;
        const y3 = h / 2 + shaftHalf;
        const y4 = h / 2 + headHalf;
        if (preset === "leftArrowCallout") {
          const x12 = ss * a3;
          const x22 = w - w * a4;
          return [x22, 0, x22, y2, x12, y2, x12, y1, 0, h / 2, x12, y4, x12, y3, x22, y3, x22, h, w, h, w, 0];
        }
        const x1 = w - ss * a3;
        const x2 = w * a4;
        return [x2, 0, x2, y2, x1, y2, x1, y1, w, h / 2, x1, y4, x1, y3, x2, y3, x2, h, 0, h, 0, 0];
      }
      case "leftRightArrow": {
        const thick = h * frac("adj1", 5e4);
        const head = Math.min(w / 2, ss * frac("adj2", 5e4));
        const y1 = (h - thick) / 2;
        const y2 = (h + thick) / 2;
        return [
          0,
          h / 2,
          head,
          0,
          head,
          y1,
          w - head,
          y1,
          w - head,
          0,
          w,
          h / 2,
          w - head,
          h,
          w - head,
          y2,
          head,
          y2,
          head,
          h
        ];
      }
      case "upDownArrow": {
        const thick = w * frac("adj1", 5e4);
        const head = Math.min(h / 2, ss * frac("adj2", 5e4));
        const x1 = (w - thick) / 2;
        const x2 = (w + thick) / 2;
        return [
          w / 2,
          0,
          w,
          head,
          x2,
          head,
          x2,
          h - head,
          w,
          h - head,
          w / 2,
          h,
          0,
          h - head,
          x1,
          h - head,
          x1,
          head,
          0,
          head
        ];
      }
      case "chevron": {
        const d = ss * frac("adj", 5e4);
        return [0, 0, w - d, 0, w, h / 2, w - d, h, 0, h, d, h / 2];
      }
      case "homePlate": {
        const d = ss * frac("adj", 5e4);
        return [0, 0, w - d, 0, w, h / 2, w - d, h, 0, h];
      }
      case "snip1Rect": {
        const a = ss * frac("adj", 16667);
        return [0, 0, w - a, 0, w, a, w, h, 0, h];
      }
      case "snip2SameRect": {
        const a1 = ss * frac("adj1", 16667);
        const a2 = ss * frac("adj2", 0);
        return [a1, 0, w - a1, 0, w, a1, w, h - a2, w - a2, h, a2, h, 0, h - a2, 0, a1];
      }
      case "snip2DiagRect": {
        const a1 = ss * frac("adj1", 0);
        const a2 = ss * frac("adj2", 16667);
        return [a1, 0, w - a2, 0, w, a2, w, h - a1, w - a1, h, a2, h, 0, h - a2, 0, a1];
      }
      case "halfFrame": {
        const y1 = ss * frac("adj1", 33333);
        const x1 = ss * frac("adj2", 33333);
        const x2 = Math.max(w - y1 * w / h, x1);
        const y2 = Math.max(h - x1 * h / w, y1);
        return [0, 0, w, 0, x2, y1, x1, y1, x1, y2, 0, h];
      }
      case "corner": {
        const y1 = ss * frac("adj1", 5e4);
        const x1 = ss * frac("adj2", 5e4);
        return [0, 0, x1, 0, x1, h - y1, w, h - y1, w, h, 0, h];
      }
      case "diagStripe": {
        const a = frac("adj", 5e4);
        return [0, h * a, w * a, 0, w, 0, 0, h];
      }
      case "lightningBolt": {
        const u = [
          8472,
          0,
          12860,
          6672,
          11050,
          6672,
          16577,
          12007,
          14767,
          12007,
          21600,
          21600,
          10800,
          14387,
          12377,
          14387,
          5333,
          6667,
          7778,
          6667
        ];
        return u.map((v, i) => v / 21600 * (i % 2 === 0 ? w : h));
      }
      case "flowChartPreparation":
        return [w * 0.2, 0, w * 0.8, 0, w, h / 2, w * 0.8, h, w * 0.2, h, 0, h / 2];
      case "flowChartManualInput":
        return [0, h / 5, w, 0, w, h, 0, h];
      case "flowChartManualOperation":
        return [0, 0, w, 0, w * 0.8, h, w * 0.2, h];
      case "flowChartOffpageConnector":
        return [0, 0, w, 0, w, h * 0.8, w / 2, h, 0, h * 0.8];
      case "flowChartExtract":
        return [w / 2, 0, w, h, 0, h];
      case "flowChartMerge":
        return [0, 0, w, 0, w / 2, h];
      case "flowChartCollate":
        return [0, 0, w, 0, w / 2, h / 2, w, h, 0, h, w / 2, h / 2];
      case "gear6": {
        const depth = Math.min(frac("adj1", 15e3) * 2, 0.6);
        return gearPoints(6, w, h, 1 - depth);
      }
      case "gear9": {
        const depth = Math.min(frac("adj1", 1e4) * 2, 0.6);
        return gearPoints(9, w, h, 1 - depth);
      }
      case "quadArrow": {
        const sw2 = ss * frac("adj1", 22500) / 2;
        const hw = ss * frac("adj2", 22500);
        const hl = ss * frac("adj3", 22500);
        const cx = w / 2;
        const cy = h / 2;
        return [
          cx,
          0,
          cx + hw,
          hl,
          cx + sw2,
          hl,
          cx + sw2,
          cy - sw2,
          w - hl,
          cy - sw2,
          w - hl,
          cy - hw,
          w,
          cy,
          w - hl,
          cy + hw,
          w - hl,
          cy + sw2,
          cx + sw2,
          cy + sw2,
          cx + sw2,
          h - hl,
          cx + hw,
          h - hl,
          cx,
          h,
          cx - hw,
          h - hl,
          cx - sw2,
          h - hl,
          cx - sw2,
          cy + sw2,
          hl,
          cy + sw2,
          hl,
          cy + hw,
          0,
          cy,
          hl,
          cy - hw,
          hl,
          cy - sw2,
          cx - sw2,
          cy - sw2,
          cx - sw2,
          hl,
          cx - hw,
          hl
        ];
      }
      case "bentArrow": {
        const t = ss * frac("adj1", 25e3);
        const hw = ss * frac("adj2", 25e3);
        const hl = ss * frac("adj3", 25e3);
        const yc = Math.max(hw, t / 2);
        return [
          0,
          h,
          0,
          yc - t / 2,
          w - hl,
          yc - t / 2,
          w - hl,
          yc - hw,
          w,
          yc,
          w - hl,
          yc + hw,
          w - hl,
          yc + t / 2,
          t,
          yc + t / 2,
          t,
          h
        ];
      }
      case "wedgeRectCallout": {
        const tipX = w / 2 + w * adjRaw(adjust, "adj1", -20833);
        const tipY = h / 2 + h * adjRaw(adjust, "adj2", 62500);
        return wedgeCalloutPolygon(w, h, tipX, tipY);
      }
      case "irregularSeal1":
        return sealPoints(IRREGULAR_SEAL_1, w, h);
      case "irregularSeal2":
        return sealPoints(IRREGULAR_SEAL_2, w, h);
      case "star4":
        return starPoints(4, w, h, frac("adj", 12500));
      case "star5":
        return starPoints(5, w, h, frac("adj", 19098));
      case "star6":
        return starPoints(6, w, h, frac("adj", 28868));
      case "star7":
        return starPoints(7, w, h, frac("adj", 34601));
      case "star8":
        return starPoints(8, w, h, frac("adj", 37500));
      case "star10":
        return starPoints(10, w, h, frac("adj", 42533));
      case "star12":
        return starPoints(12, w, h, frac("adj", 37500));
      case "star16":
        return starPoints(16, w, h, frac("adj", 37500));
      case "star24":
        return starPoints(24, w, h, frac("adj", 37500));
      case "star32":
        return starPoints(32, w, h, frac("adj", 37500));
      default:
        return null;
    }
  }
  function adjRaw(adjust, name, dflt) {
    const v = (adjust?.[name] ?? dflt) / 1e5;
    return Math.min(Math.max(v, -2), 2);
  }
  function wedgeCalloutPolygon(w, h, tipX, tipY) {
    const g = Math.min(w, h) * 0.1;
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    const nx = (tipX - w / 2) / w;
    const ny = (tipY - h / 2) / h;
    if (Math.abs(ny) >= Math.abs(nx)) {
      const bx = clamp(tipX, 2 * g, w - 2 * g);
      if (ny >= 0) return [0, 0, w, 0, w, h, bx + g, h, tipX, tipY, bx - g, h, 0, h];
      return [0, 0, bx - g, 0, tipX, tipY, bx + g, 0, w, 0, w, h, 0, h];
    }
    const by = clamp(tipY, 2 * g, h - 2 * g);
    if (nx >= 0) return [0, 0, w, 0, w, by - g, tipX, tipY, w, by + g, w, h, 0, h];
    return [0, 0, w, 0, w, h, 0, h, 0, by + g, tipX, tipY, 0, by - g];
  }
  function gearPoints(teeth, w, h, innerR) {
    const cx = w / 2;
    const cy = h / 2;
    const pitch = 360 / teeth;
    const tipHalf = pitch * 0.16;
    const rootHalf = pitch * 0.38;
    const pts = [];
    for (let i = 0; i < teeth; i++) {
      const c = -90 + i * pitch;
      for (const [off, r] of [
        [-rootHalf, innerR],
        [-tipHalf, 1],
        [tipHalf, 1],
        [rootHalf, innerR]
      ]) {
        const a = (c + off) * Math.PI / 180;
        pts.push(cx + Math.cos(a) * cx * r, cy + Math.sin(a) * cy * r);
      }
    }
    return pts;
  }
  var IRREGULAR_SEAL_1 = [
    10800,
    5800,
    14522,
    0,
    14155,
    5325,
    18380,
    4457,
    16702,
    7315,
    21097,
    8137,
    17607,
    10475,
    21600,
    13290,
    16837,
    12942,
    18145,
    18095,
    14020,
    14457,
    13247,
    19737,
    10532,
    14935,
    8485,
    21600,
    7715,
    15627,
    4762,
    17617,
    5667,
    13937,
    135,
    14587,
    3722,
    11775,
    0,
    8837,
    4627,
    7992,
    2777,
    4912,
    7772,
    6142,
    8485,
    1017
  ];
  var IRREGULAR_SEAL_2 = [
    11462,
    4342,
    14790,
    0,
    14525,
    5777,
    18007,
    3172,
    16380,
    6532,
    21600,
    6645,
    16985,
    9402,
    18270,
    11290,
    16380,
    12310,
    18877,
    15632,
    14640,
    14350,
    14942,
    17370,
    12180,
    15935,
    11612,
    18842,
    9872,
    17370,
    8700,
    19712,
    7527,
    18125,
    4917,
    21600,
    4805,
    18240,
    1285,
    17825,
    3330,
    15370,
    0,
    12877,
    3935,
    11592,
    1172,
    8270,
    5372,
    7817,
    4502,
    3625,
    8550,
    6382,
    9722,
    1887
  ];
  function sealPoints(coords21600, w, h) {
    const pts = [];
    for (let i = 0; i < coords21600.length; i += 2) {
      pts.push(coords21600[i] / 21600 * w, coords21600[i + 1] / 21600 * h);
    }
    return pts;
  }
  function starPoints(n, w, h, innerFrac) {
    const cx = w / 2;
    const cy = h / 2;
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const ang = -Math.PI / 2 + i * Math.PI / n;
      const f = i % 2 === 0 ? 1 : innerFrac * 2;
      const fr = Math.min(f, 1);
      pts.push(cx + Math.cos(ang) * cx * fr, cy + Math.sin(ang) * cy * fr);
    }
    return pts;
  }
  function isPillPreset(preset) {
    return preset === "flowChartTerminator" || preset === "flowChartAlternateProcess";
  }
  var R2 = (v) => Math.round(v * 100) / 100;
  var D2R = Math.PI / 180;
  var PathB = class {
    parts = [];
    M(x, y) {
      this.parts.push(`M ${R2(x)} ${R2(y)}`);
      return this;
    }
    L(x, y) {
      this.parts.push(`L ${R2(x)} ${R2(y)}`);
      return this;
    }
    Q(x1, y1, x, y) {
      this.parts.push(`Q ${R2(x1)} ${R2(y1)} ${R2(x)} ${R2(y)}`);
      return this;
    }
    C(x1, y1, x2, y2, x, y) {
      this.parts.push(`C ${R2(x1)} ${R2(y1)} ${R2(x2)} ${R2(y2)} ${R2(x)} ${R2(y)}`);
      return this;
    }
    Z() {
      this.parts.push("Z");
      return this;
    }
    /** Parametric angles (degrees, y-down clockwise positive); move says whether to M/L to the arc start first */
    arc(cx, cy, rx, ry, startDeg, sweepDeg, move) {
      const st = startDeg * D2R;
      const sw = sweepDeg * D2R;
      const sx = cx + rx * Math.cos(st);
      const sy = cy + ry * Math.sin(st);
      if (move === "M") this.M(sx, sy);
      else if (move === "L") this.L(sx, sy);
      if (sw === 0) return this;
      const segs = Math.max(1, Math.ceil(Math.abs(sw) / (Math.PI / 2)));
      const da = sw / segs;
      const k = 4 / 3 * Math.tan(da / 4);
      for (let i = 0; i < segs; i++) {
        const a1 = st + i * da;
        const a2 = a1 + da;
        const x1 = cx + rx * Math.cos(a1);
        const y1 = cy + ry * Math.sin(a1);
        const x2 = cx + rx * Math.cos(a2);
        const y2 = cy + ry * Math.sin(a2);
        this.C(
          x1 - k * rx * Math.sin(a1),
          y1 + k * ry * Math.cos(a1),
          x2 + k * rx * Math.sin(a2),
          y2 - k * ry * Math.cos(a2),
          x2,
          y2
        );
      }
      return this;
    }
    d() {
      return this.parts.join(" ");
    }
  };
  function ellipseSub(b, cx, cy, rx, ry, ccw = false) {
    b.arc(cx, cy, rx, ry, 0, ccw ? -360 : 360, "M").Z();
  }
  function mixedCornerRect(w, h, sizes, kinds) {
    const [tl, tr, br, bl] = sizes;
    const b = new PathB();
    b.M(tl, 0).L(w - tr, 0);
    if (kinds[1] === "round") b.arc(w - tr, tr, tr, tr, 270, 90);
    else if (kinds[1] === "snip") b.L(w, tr);
    b.L(w, h - br);
    if (kinds[2] === "round") b.arc(w - br, h - br, br, br, 0, 90);
    else if (kinds[2] === "snip") b.L(w - br, h);
    b.L(bl, h);
    if (kinds[3] === "round") b.arc(bl, h - bl, bl, bl, 90, 90);
    else if (kinds[3] === "snip") b.L(0, h - bl);
    b.L(0, tl);
    if (kinds[0] === "round") b.arc(tl, tl, tl, tl, 180, 90);
    else if (kinds[0] === "snip") b.L(tl, 0);
    return b.Z().d();
  }
  function cloudBlob(w, h) {
    const b = new PathB();
    const u = [
      [0.2, 0.85],
      [0.06, 0.86],
      [0, 0.72],
      [0.02, 0.59],
      [0.03, 0.47],
      [0.11, 0.39],
      [0.2, 0.42],
      [0.19, 0.26],
      [0.29, 0.14],
      [0.4, 0.2],
      [0.45, 0.07],
      [0.6, 0.04],
      [0.67, 0.14],
      [0.76, 0.04],
      [0.91, 0.1],
      [0.92, 0.26],
      [0.99, 0.31],
      [1, 0.46],
      [0.97, 0.56],
      [1, 0.69],
      [0.94, 0.81],
      [0.85, 0.82],
      [0.83, 0.94],
      [0.72, 0.98],
      [0.65, 0.91],
      [0.58, 1],
      [0.45, 1],
      [0.39, 0.91],
      [0.33, 0.98],
      [0.23, 0.95],
      [0.2, 0.85]
    ];
    b.M(u[0][0] * w, u[0][1] * h);
    for (let i = 1; i + 2 < u.length + 1; i += 3) {
      b.C(
        u[i][0] * w,
        u[i][1] * h,
        u[i + 1][0] * w,
        u[i + 1][1] * h,
        u[i + 2][0] * w,
        u[i + 2][1] * h
      );
    }
    return b.Z();
  }
  function presetPath(preset, w, h, adjust) {
    if (!preset || w <= 0 || h <= 0) return null;
    const ss = Math.min(w, h);
    const cx = w / 2;
    const cy = h / 2;
    const frac = (name, dflt) => Math.min(Math.max((adjust?.[name] ?? dflt) / 1e5, 0), 1);
    const ang = (name, dflt) => (adjust?.[name] ?? dflt) / 6e4;
    const sweepCW = (a1, a2) => ((a2 - a1) % 360 + 360) % 360;
    switch (preset) {
      case "arc": {
        const a1 = ang("adj1", 162e5);
        const a2 = ang("adj2", 0);
        const sw = sweepCW(a1, a2) || 90;
        const fill = new PathB().M(cx, cy);
        fill.arc(cx, cy, cx, cy, a1, sw, "L").Z();
        const stroke = new PathB().arc(cx, cy, cx, cy, a1, sw, "M");
        return { fillPath: fill.d(), strokePath: stroke.d() };
      }
      case "chord": {
        const a1 = ang("adj1", 27e5);
        const a2 = ang("adj2", 162e5);
        return {
          path: new PathB().arc(cx, cy, cx, cy, a1, sweepCW(a1, a2) || 180, "M").Z().d()
        };
      }
      case "pie": {
        const a1 = ang("adj1", 0);
        const a2 = ang("adj2", 162e5);
        return {
          path: new PathB().M(cx, cy).arc(cx, cy, cx, cy, a1, sweepCW(a1, a2) || 270, "L").Z().d()
        };
      }
      case "blockArc": {
        const a1 = ang("adj1", 108e5);
        const a2 = ang("adj2", 0);
        const sw = sweepCW(a1, a2) || 180;
        const t = ss * frac("adj3", 25e3);
        const rxI = Math.max(cx - t, 0);
        const ryI = Math.max(cy - t, 0);
        const b = new PathB().arc(cx, cy, cx, cy, a1, sw, "M");
        b.arc(cx, cy, rxI, ryI, a1 + sw, -sw, "L").Z();
        return { path: b.d() };
      }
      case "circularArrow":
      case "leftCircularArrow": {
        const left = preset === "leftCircularArrow";
        const t = ss * frac("adj1", 12500);
        const headSpan = Math.min(ang("adj2", 1142319), 90);
        const end = ang("adj3", left ? 1142319 : 20457681);
        const start = ang("adj4", 108e5);
        const headR = Math.max(ss * frac("adj5", 12500), t * 0.75);
        const rxO = Math.max(cx - headR, 0);
        const ryO = Math.max(cy - headR, 0);
        const rxI = Math.max(rxO - t, 0);
        const ryI = Math.max(ryO - t, 0);
        const rxM = (rxO + rxI) / 2;
        const ryM = (ryO + ryI) / 2;
        const total = left ? -(sweepCW(end, start) || 250) : sweepCW(start, end) || 250;
        const headAng = left ? -headSpan : headSpan;
        const sweep = total - headAng;
        const bodyEnd = start + sweep;
        const pt = (deg, rx, ry) => [cx + rx * Math.cos(deg * D2R), cy + ry * Math.sin(deg * D2R)];
        const b = new PathB().arc(cx, cy, rxO, ryO, start, sweep, "M");
        const [hx1, hy1] = pt(bodyEnd, rxM + headR, ryM + headR);
        const [tx, ty] = pt(bodyEnd + headAng, rxM, ryM);
        const [hx2, hy2] = pt(bodyEnd, Math.max(rxM - headR, 0), Math.max(ryM - headR, 0));
        b.L(hx1, hy1).L(tx, ty).L(hx2, hy2);
        b.arc(cx, cy, rxI, ryI, bodyEnd, -sweep, "L").Z();
        return { path: b.d() };
      }
      case "donut": {
        const t = ss * frac("adj", 25e3);
        const b = new PathB();
        ellipseSub(b, cx, cy, cx, cy);
        ellipseSub(b, cx, cy, Math.max(cx - t, 0), Math.max(cy - t, 0), true);
        return { path: b.d() };
      }
      case "frame": {
        const t = ss * frac("adj1", 12500);
        const b = new PathB().M(0, 0).L(w, 0).L(w, h).L(0, h).Z();
        b.M(t, t).L(t, h - t).L(w - t, h - t).L(w - t, t).Z();
        return { path: b.d() };
      }
      case "round1Rect": {
        const r = ss * frac("adj", 16667);
        return { path: mixedCornerRect(w, h, [0, r, 0, 0], ["none", "round", "none", "none"]) };
      }
      case "round2SameRect": {
        const r1 = ss * frac("adj1", 16667);
        const r2 = ss * frac("adj2", 0);
        return { path: mixedCornerRect(w, h, [r1, r1, r2, r2], ["round", "round", "round", "round"]) };
      }
      case "round2DiagRect": {
        const r1 = ss * frac("adj1", 16667);
        const r2 = ss * frac("adj2", 0);
        return { path: mixedCornerRect(w, h, [r1, r2, r1, r2], ["round", "round", "round", "round"]) };
      }
      case "snipRoundRect": {
        const r1 = ss * frac("adj1", 16667);
        const r2 = ss * frac("adj2", 16667);
        return { path: mixedCornerRect(w, h, [r1, r2, 0, 0], ["round", "snip", "none", "none"]) };
      }
      case "mathEqual": {
        const a1 = Math.min(frac("adj1", 23520), 0.36745);
        const a2 = Math.min(frac("adj2", 11760), 1 - 2 * a1);
        const dy1 = h * a1;
        const dy2 = h * a2 / 2;
        const dx1 = w * 73490 / 2e5;
        const x1 = cx - dx1;
        const x2 = cx + dx1;
        const y2 = cy - dy2;
        const y3 = cy + dy2;
        const y1 = y2 - dy1;
        const y4 = y3 + dy1;
        const b = new PathB().M(x1, y1).L(x2, y1).L(x2, y2).L(x1, y2).Z();
        b.M(x1, y3).L(x2, y3).L(x2, y4).L(x1, y4).Z();
        return { path: b.d() };
      }
      case "funnel": {
        const d = ss / 20;
        const hd4 = h / 4;
        const rw3 = cx / 4;
        const rh3 = hd4 / 4;
        const par = (deg) => Math.atan2(cx * Math.sin(deg * D2R), hd4 * Math.cos(deg * D2R)) / D2R;
        const da = Math.atan2(hd4 * Math.sin(8 * D2R), cx * Math.cos(8 * D2R)) / D2R;
        const t0 = par(180 - da);
        const t3 = par(da);
        const b = new PathB();
        b.arc(cx, hd4, cx, hd4, t0, t3 + 360 - t0, "M");
        b.arc(cx, h - rh3, rw3, rh3, t3, par(180 - da) - t3, "L").Z();
        b.arc(cx, hd4, Math.max(cx - d, 0), Math.max(hd4 - d, 0), 180, -360, "M").Z();
        return { path: b.d() };
      }
      case "heart": {
        const b = new PathB().M(0.5 * w, 0.3 * h);
        b.C(0.5 * w, 0.12 * h, 0.36 * w, 0.01 * h, 0.22 * w, 0.01 * h);
        b.C(0.06 * w, 0.01 * h, 0, 0.15 * h, 0, 0.28 * h);
        b.C(0, 0.5 * h, 0.2 * w, 0.65 * h, 0.5 * w, h);
        b.C(0.8 * w, 0.65 * h, w, 0.5 * h, w, 0.28 * h);
        b.C(w, 0.15 * h, 0.94 * w, 0.01 * h, 0.78 * w, 0.01 * h);
        b.C(0.64 * w, 0.01 * h, 0.5 * w, 0.12 * h, 0.5 * w, 0.3 * h);
        return { path: b.Z().d() };
      }
      case "moon": {
        const g = frac("adj", 5e4);
        const b = new PathB().arc(w, cy, w, cy, 270, -180, "M");
        b.arc(w, cy, w * (1 - g), cy, 90, 180);
        return { path: b.Z().d() };
      }
      case "sun": {
        const g = frac("adj", 25e3);
        const rx = w * g;
        const ry = h * g;
        const b = new PathB();
        for (let k = 0; k < 8; k++) {
          const a = k * 45 * D2R;
          const tipX = cx + cx * Math.cos(a);
          const tipY = cy + cy * Math.sin(a);
          const br = 1.35;
          const a1 = a - 12 * D2R;
          const a2 = a + 12 * D2R;
          b.M(cx + rx * br * Math.cos(a1), cy + ry * br * Math.sin(a1)).L(tipX, tipY).L(cx + rx * br * Math.cos(a2), cy + ry * br * Math.sin(a2)).Z();
        }
        ellipseSub(b, cx, cy, rx, ry);
        return { path: b.d() };
      }
      case "cloud":
        return { path: cloudBlob(w, h).d() };
      case "cloudCallout": {
        const tipX = cx + w * adjRaw(adjust, "adj1", -20833);
        const tipY = cy + h * adjRaw(adjust, "adj2", 62500);
        const b = cloudBlob(w, h);
        for (const [t, r] of [
          [0.72, 0.075],
          [0.92, 0.045]
        ]) {
          ellipseSub(b, cx + (tipX - cx) * t, cy + (tipY - cy) * t, ss * r, ss * r);
        }
        return { path: b.d() };
      }
      case "teardrop": {
        const a = Math.min(Math.max((adjust?.adj ?? 1e5) / 1e5, 0), 2);
        const tipX = cx + cx * a;
        const tipY = cy - cy * a;
        const b = new PathB().arc(cx, cy, cx, cy, 0, 270, "M");
        b.Q(cx + (tipX - cx) / 2, tipY, tipX, tipY).Q(w, (tipY + cy) / 2, w, cy);
        return { path: b.Z().d() };
      }
      case "plaque": {
        const r = ss * frac("adj", 16667);
        const b = new PathB().M(r, 0).L(w - r, 0);
        b.arc(w, 0, r, r, 180, -90).L(w, h - r);
        b.arc(w, h, r, r, 270, -90).L(r, h);
        b.arc(0, h, r, r, 0, -90).L(0, r);
        b.arc(0, 0, r, r, 90, -90);
        return { path: b.Z().d() };
      }
      case "cube": {
        const d = ss * frac("adj", 25e3);
        const path = new PathB().M(0, d).L(d, 0).L(w, 0).L(w, h - d).L(w - d, h).L(0, h).Z().d();
        const inner = new PathB().M(0, d).L(w - d, d).L(w, 0).M(w - d, d).L(w - d, h).d();
        return { path, strokePath: inner };
      }
      case "can": {
        const ry = h * frac("adj", 25e3) / 2;
        const b = new PathB().M(0, ry).L(0, h - ry);
        b.arc(cx, h - ry, cx, ry, 180, -180).L(w, ry);
        b.arc(cx, ry, cx, ry, 0, -180).Z();
        const rim = new PathB().arc(cx, ry, cx, ry, 180, -180, "M").d();
        return { path: b.d(), strokePath: rim };
      }
      case "flowChartMagneticDisk": {
        const ry = h / 6;
        const b = new PathB().M(0, ry).L(0, h - ry);
        b.arc(cx, h - ry, cx, ry, 180, -180).L(w, ry);
        b.arc(cx, ry, cx, ry, 0, -180).Z();
        const rim = new PathB().arc(cx, ry, cx, ry, 180, -180, "M").d();
        return { path: b.d(), strokePath: rim };
      }
      case "flowChartMagneticDrum": {
        const rx = w / 6;
        const b = new PathB().arc(w - rx, cy, rx, cy, 270, 180, "M").L(rx, h);
        b.arc(rx, cy, rx, cy, 90, 180).Z();
        const rim = new PathB().arc(w - rx, cy, rx, cy, 270, -180, "M").d();
        return { path: b.d(), strokePath: rim };
      }
      case "bevel": {
        const t = ss * frac("adj", 12500);
        const path = new PathB().M(0, 0).L(w, 0).L(w, h).L(0, h).Z().d();
        const inner = new PathB().M(t, t).L(w - t, t).L(w - t, h - t).L(t, h - t).Z().M(0, 0).L(t, t).M(w, 0).L(w - t, t).M(w, h).L(w - t, h - t).M(0, h).L(t, h - t);
        return { path, strokePath: inner.d() };
      }
      case "foldedCorner": {
        const f = ss * frac("adj", 16667);
        const path = new PathB().M(0, 0).L(w, 0).L(w, h - f).L(w - f, h).L(0, h).Z().d();
        const fold = new PathB().M(w - f, h).L(w - 0.8 * f, h - 0.8 * f).L(w, h - f).d();
        return { path, strokePath: fold };
      }
      case "smileyFace": {
        const b = new PathB();
        ellipseSub(b, cx, cy, cx, cy);
        const g = adjRaw(adjust, "adj", 4653);
        const face = new PathB();
        ellipseSub(face, 0.35 * w, 0.37 * h, 0.05 * w, 0.05 * h);
        ellipseSub(face, 0.65 * w, 0.37 * h, 0.05 * w, 0.05 * h);
        face.M(0.3 * w, 0.67 * h).Q(cx, h * Math.min(Math.max(0.67 + 4 * g, 0.4), 0.95), 0.7 * w, 0.67 * h);
        return { path: b.d(), strokePath: face.d() };
      }
      case "noSmoking": {
        const t = ss * frac("adj", 18750);
        const b = new PathB();
        ellipseSub(b, cx, cy, cx, cy);
        const rxI = Math.max(cx - t, 0);
        const ryI = Math.max(cy - t, 0);
        ellipseSub(b, cx, cy, rxI, ryI, true);
        const p1x = cx + rxI * Math.cos(225 * D2R);
        const p1y = cy + ryI * Math.sin(225 * D2R);
        const p2x = cx + rxI * Math.cos(45 * D2R);
        const p2y = cy + ryI * Math.sin(45 * D2R);
        const len = Math.hypot(p2x - p1x, p2y - p1y) || 1;
        const nx = -(p2y - p1y) / len * (t / 2);
        const ny = (p2x - p1x) / len * (t / 2);
        b.M(p1x + nx, p1y + ny).L(p2x + nx, p2y + ny).L(p2x - nx, p2y - ny).L(p1x - nx, p1y - ny).Z();
        return { path: b.d() };
      }
      case "ribbon": {
        const b = new PathB();
        b.M(0, 0.25 * h).L(0.25 * w, 0.25 * h).L(0.25 * w, h).L(0, h).L(0.0833 * w, 0.625 * h).Z();
        b.M(w, 0.25 * h).L(0.75 * w, 0.25 * h).L(0.75 * w, h).L(w, h).L(0.9167 * w, 0.625 * h).Z();
        b.M(0.125 * w, 0).L(0.875 * w, 0).L(0.875 * w, 0.75 * h).L(0.125 * w, 0.75 * h).Z();
        return { path: b.d() };
      }
      case "ribbon2": {
        const b = new PathB();
        b.M(0, 0.75 * h).L(0.25 * w, 0.75 * h).L(0.25 * w, 0).L(0, 0).L(0.0833 * w, 0.375 * h).Z();
        b.M(w, 0.75 * h).L(0.75 * w, 0.75 * h).L(0.75 * w, 0).L(w, 0).L(0.9167 * w, 0.375 * h).Z();
        b.M(0.125 * w, h).L(0.875 * w, h).L(0.875 * w, 0.25 * h).L(0.125 * w, 0.25 * h).Z();
        return { path: b.d() };
      }
      case "wave": {
        const a = h * Math.min(frac("adj1", 12500), 0.25);
        const b = new PathB().M(0, a);
        b.C(w / 6, 0, w / 3, 0, w / 2, a).C(2 * w / 3, 2 * a, 5 * w / 6, 2 * a, w, a);
        b.L(w, h - a);
        b.C(5 * w / 6, h, 2 * w / 3, h, w / 2, h - a).C(
          w / 3,
          h - 2 * a,
          w / 6,
          h - 2 * a,
          0,
          h - a
        );
        return { path: b.Z().d() };
      }
      case "doubleWave": {
        const a = h * Math.min(frac("adj1", 6250), 0.2);
        const b = new PathB().M(0, a);
        b.C(w / 12, 0, w / 6, 0, w / 4, a).C(w / 3, 2 * a, 5 * w / 12, 2 * a, w / 2, a);
        b.C(7 * w / 12, 0, 2 * w / 3, 0, 3 * w / 4, a).C(
          5 * w / 6,
          2 * a,
          11 * w / 12,
          2 * a,
          w,
          a
        );
        b.L(w, h - a);
        b.C(11 * w / 12, h, 5 * w / 6, h, 3 * w / 4, h - a).C(
          2 * w / 3,
          h - 2 * a,
          7 * w / 12,
          h - 2 * a,
          w / 2,
          h - a
        );
        b.C(5 * w / 12, h, w / 3, h, w / 4, h - a).C(w / 6, h - 2 * a, w / 12, h - 2 * a, 0, h - a);
        return { path: b.Z().d() };
      }
      case "uturnArrow": {
        const t = ss * frac("adj1", 25e3);
        const hw = 0.75 * t;
        const hl = t;
        const xrc = w - hw;
        const rxO = (xrc + t / 2) / 2;
        const ryO = Math.min(h / 2, rxO);
        const b = new PathB().M(0, h).L(0, ryO);
        b.arc(rxO, ryO, rxO, ryO, 180, 180);
        const yh = h - hl;
        b.L(xrc + t / 2, yh).L(xrc + hw, yh).L(xrc, h).L(xrc - hw, yh).L(xrc - t / 2, yh).L(xrc - t / 2, ryO);
        b.arc(rxO, ryO, Math.max(rxO - t, 0), Math.max(ryO - t, ryO * 0.2), 0, -180);
        b.L(t, h).Z();
        return { path: b.d() };
      }
      case "curvedDownArrow":
      case "curvedUpArrow": {
        const up = preset === "curvedUpArrow";
        const a1 = Math.min(Math.max(adjust?.adj1 ?? 25e3, 0), 1e5);
        const a2 = Math.min(Math.max(adjust?.adj2 ?? 5e4, 0), 5e4 * w / ss);
        const th = ss * a1 / 1e5;
        const aw = ss * a2 / 1e5;
        const wR = w / 2 - (th + aw) / 4;
        if (wR <= 0 || h <= 0) return null;
        const idy = Math.sqrt(Math.max(4 * wR * wR - th * th, 0)) * h / (2 * wR);
        const a3 = Math.min(Math.max(adjust?.adj3 ?? 25e3, 0), 1e5 * idy / ss);
        const ah = ss * a3 / 1e5;
        const dx = Math.sqrt(Math.max(h * h - ah * ah, 0)) * wR / h;
        const x3 = wR + th;
        const x5 = wR + dx;
        const x7 = x3 + dx;
        const dh = (aw - th) / 2;
        const x6 = w - aw / 2;
        const y1 = h - ah;
        const polar = Math.atan2(dx, ah);
        const paramDeg = Math.atan2(wR * Math.sin(polar), h * Math.cos(polar)) * 180 / Math.PI;
        const Y = (y) => up ? h - y : y;
        const A = (deg) => up ? -deg : deg;
        const b = new PathB().M(x6, Y(h)).L(x5 - dh, Y(y1)).L(x5, Y(y1));
        b.arc(wR, Y(h), wR, h, A(270 + paramDeg), A(-(90 + paramDeg)));
        b.L(th, Y(h));
        b.arc(x3, Y(h), wR, h, A(180), A(90 + paramDeg));
        b.L(x7 + dh, Y(y1)).Z();
        return { path: b.d() };
      }
      case "curvedRightArrow": {
        const t = ss * frac("adj1", 25e3);
        const b = new PathB().M(0, 0);
        b.arc(0, cy, w, cy, 270, 90);
        const bi = Math.max(w - 1.5 * t, 0);
        b.L((w + bi) / 2, Math.min(h, cy + 1.2 * t)).L(bi, cy).L(w - t, cy);
        b.arc(0, cy, Math.max(w - t, 0), Math.max(cy - t, 0), 0, -90);
        b.L(0, 0).Z();
        return { path: b.d() };
      }
      case "stripedRightArrow": {
        const thick = h * frac("adj1", 5e4);
        const head = Math.min(w, ss * frac("adj2", 5e4));
        const y1 = (h - thick) / 2;
        const y2 = (h + thick) / 2;
        const xh = w - head;
        const bs = ss * 5 / 32;
        const b = new PathB();
        b.M(bs, y1).L(xh, y1).L(xh, 0).L(w, cy).L(xh, h).L(xh, y2).L(bs, y2).Z();
        b.M(0, y1).L(ss / 32, y1).L(ss / 32, y2).L(0, y2).Z();
        b.M(ss / 16, y1).L(ss / 8, y1).L(ss / 8, y2).L(ss / 16, y2).Z();
        return { path: b.d() };
      }
      case "swooshArrow": {
        const a1 = Math.min(Math.max(adjust?.adj1 ?? 25e3, 1), 75e3) / 1e5;
        const maxAdj2 = 7e4 * w / ss;
        const a2 = Math.min(Math.max(adjust?.adj2 ?? 16667, 0), maxAdj2);
        const ad1 = h * a1;
        const ad2 = ss * a2 / 1e5;
        const ssd8 = ss / 8;
        const tanAlfa = Math.tan(Math.PI / 2 / 14);
        const xB = w - ad2;
        const yB = ssd8;
        const xC = xB - ssd8 * tanAlfa;
        const yF = yB + ad1;
        const xF = xB + ad1 * tanAlfa;
        const xE = xF + ssd8 * tanAlfa;
        const yE = yF + ssd8;
        const yD = yE / 2 + h / 20;
        const b = new PathB();
        b.M(0, h).Q(w / 6, h / 3, xB, yB).L(xC, 0).L(w, yD).L(xE, yE).L(xF, yF).Q(w / 4, yF + h / 12, 0, h).Z();
        return { path: b.d() };
      }
      case "wedgeRoundRectCallout": {
        const r = ss * frac("adj3", 16667);
        const tipX = cx + w * adjRaw(adjust, "adj1", -20833);
        const tipY = cy + h * adjRaw(adjust, "adj2", 62500);
        const b = new PathB();
        b.M(r, 0).L(w - r, 0).arc(w - r, r, r, r, 270, 90).L(w, h - r);
        b.arc(w - r, h - r, r, r, 0, 90).L(r, h).arc(r, h - r, r, r, 90, 90).L(0, r);
        b.arc(r, r, r, r, 180, 90).Z();
        appendWedgeTail(b, w, h, tipX, tipY);
        return { path: b.d() };
      }
      case "wedgeEllipseCallout": {
        const tipX = cx + w * adjRaw(adjust, "adj1", -20833);
        const tipY = cy + h * adjRaw(adjust, "adj2", 62500);
        const b = new PathB();
        ellipseSub(b, cx, cy, cx, cy);
        const th = Math.atan2(tipY - cy, tipX - cx);
        b.M(cx + cx * Math.cos(th - 0.3), cy + cy * Math.sin(th - 0.3)).L(tipX, tipY).L(cx + cx * Math.cos(th + 0.3), cy + cy * Math.sin(th + 0.3)).Z();
        return { path: b.d() };
      }
      case "flowChartPredefinedProcess": {
        const path = new PathB().M(0, 0).L(w, 0).L(w, h).L(0, h).Z().d();
        const lines = new PathB().M(w / 8, 0).L(w / 8, h).M(7 * w / 8, 0).L(7 * w / 8, h).d();
        return { path, strokePath: lines };
      }
      case "flowChartInternalStorage": {
        const path = new PathB().M(0, 0).L(w, 0).L(w, h).L(0, h).Z().d();
        const lines = new PathB().M(w / 8, 0).L(w / 8, h).M(0, h / 8).L(w, h / 8).d();
        return { path, strokePath: lines };
      }
      case "flowChartDocument": {
        const b = new PathB().M(0, 0).L(w, 0).L(w, 0.83 * h);
        b.C(0.75 * w, 0.72 * h, 0.58 * w, 0.72 * h, 0.5 * w, 0.83 * h);
        b.C(0.42 * w, 0.94 * h, 0.25 * w, 0.94 * h, 0, 0.83 * h);
        return { path: b.Z().d() };
      }
      case "flowChartMultidocument": {
        const b = new PathB().M(0, 0.12 * h).L(0.88 * w, 0.12 * h).L(0.88 * w, 0.85 * h);
        b.C(0.66 * w, 0.74 * h, 0.51 * w, 0.74 * h, 0.44 * w, 0.85 * h);
        b.C(0.37 * w, 0.96 * h, 0.22 * w, 0.96 * h, 0, 0.85 * h);
        b.Z();
        const backs = new PathB().M(0.06 * w, 0.12 * h).L(0.06 * w, 0.06 * h).L(0.94 * w, 0.06 * h).L(0.94 * w, 0.6 * h).M(0.12 * w, 0.06 * h).L(0.12 * w, 0).L(w, 0).L(w, 0.53 * h);
        return { path: b.d(), strokePath: backs.d() };
      }
      case "flowChartConnector": {
        const b = new PathB();
        ellipseSub(b, cx, cy, cx, cy);
        return { path: b.d() };
      }
      case "flowChartOr": {
        const b = new PathB();
        ellipseSub(b, cx, cy, cx, cy);
        const lines = new PathB().M(cx, 0).L(cx, h).M(0, cy).L(w, cy).d();
        return { path: b.d(), strokePath: lines };
      }
      case "flowChartSummingJunction": {
        const b = new PathB();
        ellipseSub(b, cx, cy, cx, cy);
        const dx = cx * Math.SQRT1_2;
        const dy = cy * Math.SQRT1_2;
        const lines = new PathB().M(cx - dx, cy - dy).L(cx + dx, cy + dy).M(cx + dx, cy - dy).L(cx - dx, cy + dy).d();
        return { path: b.d(), strokePath: lines };
      }
      case "flowChartSort": {
        const path = new PathB().M(cx, 0).L(w, cy).L(cx, h).L(0, cy).Z().d();
        return { path, strokePath: new PathB().M(0, cy).L(w, cy).d() };
      }
      case "flowChartDelay": {
        const b = new PathB().M(0, 0).L(cx, 0);
        b.arc(cx, cy, cx, cy, 270, 180).L(0, h).Z();
        return { path: b.d() };
      }
      case "flowChartDisplay": {
        const b = new PathB().M(0, cy).L(w / 6, 0).L(5 * w / 6, 0);
        b.arc(5 * w / 6, cy, w / 6, cy, 270, 180).L(w / 6, h).Z();
        return { path: b.d() };
      }
      case "flowChartPunchedTape": {
        const a = 0.1 * h;
        const b = new PathB().M(0, a);
        b.C(w / 6, 0, w / 3, 0, w / 2, a).C(2 * w / 3, 2 * a, 5 * w / 6, 2 * a, w, a);
        b.L(w, h - a);
        b.C(5 * w / 6, h - 2 * a, 2 * w / 3, h - 2 * a, w / 2, h - a);
        b.C(w / 3, h, w / 6, h, 0, h - a);
        return { path: b.Z().d() };
      }
      case "leftBracket": {
        const r = Math.min(h / 2, ss * frac("adj", 8333));
        const b = new PathB().arc(w, r, w, r, 270, -90, "M").L(0, h - r).arc(w, h - r, w, r, 180, -90);
        return { strokePath: b.d() };
      }
      case "rightBracket": {
        const r = Math.min(h / 2, ss * frac("adj", 8333));
        const b = new PathB().arc(0, r, w, r, 270, 90, "M").L(w, h - r).arc(0, h - r, w, r, 0, 90);
        return { strokePath: b.d() };
      }
      case "leftBrace": {
        const r = Math.min(h / 4, ss * frac("adj1", 8333));
        const mid = h * frac("adj2", 5e4);
        const xm = w / 2;
        const b = new PathB().arc(w, r, xm, r, 270, -90, "M").L(xm, mid - r);
        b.arc(0, mid - r, xm, r, 0, 90).arc(0, mid + r, xm, r, 270, 90).L(xm, h - r);
        b.arc(w, h - r, xm, r, 180, -90);
        return { strokePath: b.d() };
      }
      case "rightBrace": {
        const r = Math.min(h / 4, ss * frac("adj1", 8333));
        const mid = h * frac("adj2", 5e4);
        const xm = w / 2;
        const b = new PathB().arc(0, r, xm, r, 270, 90, "M").L(xm, mid - r);
        b.arc(w, mid - r, xm, r, 180, -90).arc(w, mid + r, xm, r, 270, -90).L(xm, h - r);
        b.arc(0, h - r, xm, r, 0, 90);
        return { strokePath: b.d() };
      }
      default:
        return null;
    }
  }
  function appendWedgeTail(b, w, h, tipX, tipY) {
    const g = Math.min(w, h) * 0.1;
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    const nx = (tipX - w / 2) / w;
    const ny = (tipY - h / 2) / h;
    if (Math.abs(ny) >= Math.abs(nx)) {
      const bx = clamp(tipX, 2 * g, w - 2 * g);
      const ey = ny >= 0 ? h : 0;
      b.M(bx - g, ey).L(tipX, tipY).L(bx + g, ey).Z();
    } else {
      const by = clamp(tipY, 2 * g, h - 2 * g);
      const ex = nx >= 0 ? w : 0;
      b.M(ex, by - g).L(tipX, tipY).L(ex, by + g).Z();
    }
  }

  // ../genoffice/packages/pptx-render/src/scene3d.ts
  var D = 1 / 6e4;
  var cam = (parallel, rx, ry, rz, ox = 0, oy = 0, skewAmount = 0, skewAngle = 0, vx = 0, vy = 0, vz = 0) => ({
    parallel,
    rx: rx * D,
    ry: ry * D,
    rz: rz * D,
    ox,
    oy,
    skewAmount,
    skewAngle,
    vx,
    vy,
    vz
  });
  var CAMERA_PRESETS = {
    isometricBottomDown: cam(true, 2124e3, 18882e3, 17988e3),
    isometricBottomUp: cam(true, 2124e3, 2718e3, 3612e3),
    isometricLeftDown: cam(true, 21e5, 27e5, 0),
    isometricLeftUp: cam(true, 195e5, 27e5, 0),
    isometricOffAxis1Left: cam(true, 108e4, 384e4, 0),
    isometricOffAxis1Right: cam(true, 108e4, 2004e4, 0),
    isometricOffAxis1Top: cam(true, 18078e3, 1839e4, 3456e3),
    isometricOffAxis2Left: cam(true, 108e4, 156e4, 0),
    isometricOffAxis2Right: cam(true, 108e4, 1776e4, 0),
    isometricOffAxis2Top: cam(true, 18078e3, 321e4, 18144e3),
    isometricOffAxis3Bottom: cam(true, 3522e3, 1839e4, 18144e3),
    isometricOffAxis3Left: cam(true, 2052e4, 384e4, 0),
    isometricOffAxis3Right: cam(true, 2052e4, 2004e4, 0),
    isometricOffAxis4Bottom: cam(true, 3522e3, 321e4, 3456e3),
    isometricOffAxis4Left: cam(true, 2052e4, 156e4, 0),
    isometricOffAxis4Right: cam(true, 2052e4, 1776e4, 0),
    isometricRightDown: cam(true, 195e5, 189e5, 0),
    isometricRightUp: cam(true, 21e5, 189e5, 0),
    isometricTopDown: cam(true, 19476e3, 2718e3, 17988e3),
    isometricTopUp: cam(true, 19476e3, 18882e3, 3612e3),
    legacyObliqueBottom: cam(true, 0, 0, 0, 0, 0.5, 50, 90),
    legacyObliqueBottomLeft: cam(true, 0, 0, 0, -0.5, 0.5, 50, 45),
    legacyObliqueBottomRight: cam(true, 0, 0, 0, 0.5, 0.5, 50, 135),
    legacyObliqueFront: cam(true, 0, 0, 0),
    legacyObliqueLeft: cam(true, 0, 0, 0, -0.5, 0, 50, -360),
    legacyObliqueRight: cam(true, 0, 0, 0, 0.5, 0, 50, 180),
    legacyObliqueTop: cam(true, 0, 0, 0, 0, -0.5, 50, -90),
    legacyObliqueTopLeft: cam(true, 0, 0, 0, -0.5, -0.5, 50, -45),
    legacyObliqueTopRight: cam(true, 0, 0, 0, 0.5, -0.5, 50, -135),
    legacyPerspectiveBottom: cam(false, 0, 0, 0, 0, 0.5, 50, 90, 0, 3472, 25e3),
    legacyPerspectiveBottomLeft: cam(false, 0, 0, 0, -0.5, 0.5, 50, 45, -3472, 3472, 25e3),
    legacyPerspectiveBottomRight: cam(false, 0, 0, 0, 0.5, 0.5, 50, 135, 3472, 3472, 25e3),
    legacyPerspectiveFront: cam(false, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25e3),
    legacyPerspectiveLeft: cam(false, 0, 0, 0, -0.5, 0, 50, -360, -3472, 0, 25e3),
    legacyPerspectiveRight: cam(false, 0, 0, 0, 0.5, 0, 50, 180, 3472, 0, 25e3),
    legacyPerspectiveTop: cam(false, 0, 0, 0, 0, -0.5, 50, -90, 0, -3472, 25e3),
    legacyPerspectiveTopLeft: cam(false, 0, 0, 0, -0.5, -0.5, 50, -45, -3472, -3472, 25e3),
    legacyPerspectiveTopRight: cam(false, 0, 0, 0, 0.5, -0.5, 50, -135, 3472, -3472, 25e3),
    obliqueBottom: cam(true, 0, 0, 0, 0, 0.5, 30, 90),
    obliqueBottomLeft: cam(true, 0, 0, 0, -0.5, 0.5, 30, 45),
    obliqueBottomRight: cam(true, 0, 0, 0, 0.5, 0.5, 30, 135),
    obliqueLeft: cam(true, 0, 0, 0, -0.5, 0, 30, -360),
    obliqueRight: cam(true, 0, 0, 0, 0.5, 0, 30, 180),
    obliqueTop: cam(true, 0, 0, 0, 0, -0.5, 30, -90),
    obliqueTopLeft: cam(true, 0, 0, 0, -0.5, -0.5, 30, -45),
    obliqueTopRight: cam(true, 0, 0, 0, 0.5, -0.5, 30, -135),
    orthographicFront: cam(true, 0, 0, 0),
    perspectiveAbove: cam(false, 204e5, 0, 0, 0, 0, 0, 0, 0, 0, 38451),
    perspectiveAboveLeftFacing: cam(false, 2358e3, 858e3, 20466e3, 0, 0, 0, 0, 0, 0, 38451),
    perspectiveAboveRightFacing: cam(false, 2358e3, 20742e3, 1134e3, 0, 0, 0, 0, 0, 0, 38451),
    perspectiveBelow: cam(false, 12e5, 0, 0, 0, 0, 0, 0, 0, 0, 38451),
    perspectiveContrastingLeftFacing: cam(false, 624e3, 2634e3, 21384e3, 0, 0, 0, 0, 0, 0, 38451),
    perspectiveContrastingRightFacing: cam(false, 624e3, 18966e3, 216e3, 0, 0, 0, 0, 0, 0, 38451),
    perspectiveFront: cam(false, 0, 0, 0, 0, 0, 0, 0, 0, 0, 38451),
    perspectiveHeroicExtremeLeftFacing: cam(
      false,
      486e3,
      207e4,
      21426e3,
      0,
      0,
      0,
      0,
      0,
      0,
      18981
    ),
    perspectiveHeroicExtremeRightFacing: cam(
      false,
      486e3,
      1953e4,
      174e3,
      0,
      0,
      0,
      0,
      0,
      0,
      18981
    ),
    perspectiveHeroicLeftFacing: cam(false, 2094e4, 858e3, 156e3, 0, 0, 0, 0, 0, 0, 38451),
    perspectiveHeroicRightFacing: cam(false, 2094e4, 20742e3, 21444e3, 0, 0, 0, 0, 0, 0, 38451),
    perspectiveLeft: cam(false, 0, 12e5, 0, 0, 0, 0, 0, 0, 0, 38451),
    perspectiveRelaxed: cam(false, 18576e3, 0, 0, 0, 0, 0, 0, 0, 0, 38451),
    perspectiveRelaxedModerately: cam(false, 19488e3, 0, 0, 0, 0, 0, 0, 0, 0, 38451),
    perspectiveRight: cam(false, 0, 204e5, 0, 0, 0, 0, 0, 0, 0, 38451)
  };
  var L = (r, g, b, x, y, z, diffuse = true) => ({ r, g, b, x, y, z, diffuse });
  var LIGHT_RIGS = {
    balanced: {
      ambient: 0.13,
      lights: [
        L(1.05, 1.05, 1.05, 0.5263, -0.4092, -0.7453),
        L(1, 1, 1, -0.9386, 0.3426, -0.041),
        L(0.5, 0.5, 0.5, 0.0934, 0.763, 0.6396)
      ]
    },
    brightRoom: {
      ambient: 1.5,
      lights: [
        L(1, 1, 1, 0, -1, 0),
        L(1, 1, 1, 0.8227, -0.1882, -0.5364, false),
        L(-0.5, -0.5, -0.5, 0, 0, -1),
        L(0.5, 0.5, 0.5, 0, 1, 0)
      ]
    },
    chilly: {
      ambient: 0.11,
      lights: [
        L(0.31, 0.32, 0.32, 0.6574, -0.7316, -0.1806),
        L(0.45, 0.45, 0.45, -0.3539, -0.1505, -0.9231),
        L(1.03, 1.02, 1.15, 0.672, -0.6185, -0.4073),
        L(0.41, 0.45, 0.48, -0.5781, 0.7976, 0.1722)
      ]
    },
    contrasting: { ambient: 1, lights: [L(1, 1, 1, 0, -1, 0, false), L(1, 1, 1, 0, 1, 0, false)] },
    flat: {
      ambient: 1,
      lights: [
        L(0.821, 0.821, 0.821, -0.9546, -0.1619, -0.2502, false),
        L(2.072, 2.54, 2.91, 9e-4, 0.8605, 0.5095, false),
        L(3.843, 3.843, 3.843, 0.6574, -0.7316, -0.1806, false)
      ]
    },
    flood: {
      ambient: 0.13,
      lights: [
        L(1.1, 1.1, 1.1, 0.5685, -0.7651, -0.3022),
        L(1.1, 1.1, 1.1, -0.2366, -0.9595, -0.1531),
        L(0.55, 0.55, 0.55, -0.8982, 0.1386, -0.4171)
      ]
    },
    freezing: {
      ambient: 0,
      lights: [
        L(0.53, 0.567, 0.661, 0.6574, -0.7316, -0.1806),
        L(0.37, 0.461, 0.461, -0.2781, -0.4509, -0.8482),
        L(0.649, 0.638, 0.904, 0.672, -0.6185, -0.4073),
        L(0.971, 1.19, 1.363, -0.1825, 0.968, 0.1722)
      ]
    },
    glow: { ambient: 1, lights: [L(1, 1, 1, 0, -1, 0), L(0.7, 0.7, 0.7, 0, 1, 0)] },
    harsh: {
      ambient: 0.28,
      lights: [
        L(0.88, 0.88, 0.88, 0.6689, -0.6755, -0.3104),
        L(0.88, 0.88, 0.88, -0.592, -0.7371, -0.326)
      ]
    },
    legacyFlat1: {
      ambient: 0.305,
      lights: [L(0.58, 0.58, 0.58, 0, 0, -0.2), L(0.29, 0.29, 0.29, 0, 0, -0.2)]
    },
    legacyFlat2: {
      ambient: 0.305,
      lights: [L(0.58, 0.58, 0.58, -1, -1, -0.2), L(0.29, 0.29, 0.29, 0, 1, -0.2)]
    },
    legacyFlat3: {
      ambient: 0.305,
      lights: [L(0.58, 0.58, 0.58, 0, -1, -0.2), L(0.29, 0.29, 0.29, 0, 1, -0.2)]
    },
    legacyFlat4: {
      ambient: 0.305,
      lights: [L(0.58, 0.58, 0.58, 1, -1, -0.2), L(0.29, 0.29, 0.29, 0, 1, -0.2)]
    },
    legacyHarsh1: {
      ambient: 0.061,
      lights: [L(0.793, 0.793, 0.793, 0, 0, -0.2), L(0.214, 0.214, 0.214, 0, 0, -0.2)]
    },
    legacyHarsh2: {
      ambient: 0.061,
      lights: [L(0.793, 0.793, 0.793, -1, -1, -0.2), L(0.214, 0.214, 0.214, 0, 1, -0.2)]
    },
    legacyHarsh3: {
      ambient: 0.061,
      lights: [L(0.793, 0.793, 0.793, 0, -1, -0.2), L(0.214, 0.214, 0.214, 0, 1, -0.2)]
    },
    legacyHarsh4: {
      ambient: 0.061,
      lights: [L(0.793, 0.793, 0.793, 1, -1, -0.2), L(0.214, 0.214, 0.214, 0, 1, -0.2)]
    },
    legacyNormal1: {
      ambient: 0.153,
      lights: [L(0.671, 0.671, 0.671, 0, 0, -0.2), L(0.183, 0.183, 0.183, 0, 0, -0.2)]
    },
    legacyNormal2: {
      ambient: 0.153,
      lights: [L(0.671, 0.671, 0.671, -1, -1, -0.2), L(0.183, 0.183, 0.183, 0, 1, -0.2)]
    },
    legacyNormal3: {
      ambient: 0.153,
      lights: [L(0.671, 0.671, 0.671, 0, -1, -0.2), L(0.183, 0.183, 0.183, 0, 1, -0.2)]
    },
    legacyNormal4: {
      ambient: 0.153,
      lights: [L(0.671, 0.671, 0.671, 1, -1, -0.2), L(0.183, 0.183, 0.183, 0, 1, -0.2)]
    },
    morning: {
      ambient: 0,
      lights: [
        L(0.669, 0.648, 0.596, 0.6574, -0.7316, -0.1806),
        L(0.459, 0.454, 0.385, -0.2781, -0.4509, -0.8482),
        L(0.9, 0.86, 0.83, 0.672, -0.6185, -0.4073),
        L(0.911, 0.846, 0.728, -0.1825, 0.968, 0.1722)
      ]
    },
    soft: { ambient: 0.3, lights: [L(0.8, 0.8, 0.8, -0.6897, 0.2484, -0.6802)] },
    sunrise: {
      ambient: 0,
      lights: [
        L(0.667, 0.63, 0.527, 0.6574, -0.7316, -0.1806),
        L(0.459, 0.459, 0.371, -0.2781, -0.4509, -0.8482),
        L(0.826, 0.712, 0.638, 0.672, -0.6185, -0.4073),
        L(1.511, 1.319, 0.994, -0.1825, 0.968, 0.1722)
      ]
    },
    sunset: {
      ambient: 0,
      lights: [
        L(0.672, 0.169, 0.169, 0.6574, -0.7316, -0.1806),
        L(0.459, 0.448, 0.327, 0.0922, -0.3551, -0.9303),
        L(0.775, 0.612, 0.502, 0.672, -0.6185, -0.4073),
        L(0.761, 0.69, 0.397, -0.424, 0.8891, 0.1722)
      ]
    },
    threePt: {
      ambient: 0,
      lights: [
        L(1.141, 1.141, 1.141, -0.6515, -0.2693, -0.7093),
        L(0.5, 0.5, 0.5, 0.8482, 0.2469, -0.4686),
        L(1, 1, 1, 0.5634, -0.2812, 0.7769)
      ]
    },
    twoPt: {
      ambient: 0.25,
      lights: [
        L(0.84, 0.84, 0.84, 0.5266, -0.4089, -0.7454),
        L(0.3, 0.3, 0.3, -0.8983, 0.2365, -0.3704)
      ]
    }
  };
  var RIG_DIR_DEG = {
    t: 0,
    tr: 45,
    r: 90,
    br: 135,
    b: 180,
    bl: 225,
    l: 270,
    tl: 315
  };
  var IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  function matMul(a, b) {
    const o = new Array(9).fill(0);
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++)
        o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    return o;
  }
  function apply(m, v) {
    return [
      m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
      m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
      m[6] * v[0] + m[7] * v[1] + m[8] * v[2]
    ];
  }
  var rad = (deg) => deg * Math.PI / 180;
  var rotX = (a) => [
    1,
    0,
    0,
    0,
    Math.cos(a),
    Math.sin(a),
    0,
    -Math.sin(a),
    Math.cos(a)
  ];
  var rotY = (a) => [
    Math.cos(a),
    0,
    -Math.sin(a),
    0,
    1,
    0,
    Math.sin(a),
    0,
    Math.cos(a)
  ];
  var rotZ = (a) => [
    Math.cos(a),
    Math.sin(a),
    0,
    -Math.sin(a),
    Math.cos(a),
    0,
    0,
    0,
    1
  ];
  function cameraMatrix(latDeg, lonDeg, revDeg) {
    return matMul(rotZ(rad(revDeg)), matMul(rotX(rad(latDeg)), rotY(rad(lonDeg))));
  }
  var PX_PER_MM100 = 96 / 2540;
  function parseRgb(color) {
    const h = color.replace(/^#/, "");
    if (/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(h)) {
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    const m = /rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(color);
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
    return [128, 128, 128];
  }
  var toHex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  var MATERIALS = {
    warmMatte: { spec: 0.5, shin: 3, diffuse: 1, ambient: 1 },
    matte: { spec: 0, shin: 1, diffuse: 1, ambient: 1 },
    flat: { spec: 0, shin: 1, diffuse: 1, ambient: 1 },
    legacyMatte: { spec: 0, shin: 1, diffuse: 1, ambient: 1 },
    plastic: { spec: 0.6, shin: 6, diffuse: 1, ambient: 1 },
    legacyPlastic: { spec: 0.8, shin: 4, diffuse: 1, ambient: 1 },
    metal: { spec: 0.9, shin: 4, diffuse: 1.05, ambient: 1 },
    legacyMetal: { spec: 0.9, shin: 5, diffuse: 0.55, ambient: 0.6 },
    softmetal: { spec: 0.6, shin: 4, diffuse: 1, ambient: 1 },
    dkEdge: { spec: 0.8, shin: 5, diffuse: 1, ambient: 1, rim: 0.45 },
    softEdge: { spec: 0.4, shin: 4, diffuse: 1, ambient: 1 },
    clear: { spec: 0.8, shin: 5, diffuse: 1, ambient: 1 },
    powder: { spec: 0.3, shin: 3, diffuse: 1, ambient: 1 },
    translucentPowder: { spec: 0.3, shin: 3, diffuse: 1, ambient: 1 }
  };
  var DEFAULT_MATERIAL = MATERIALS.warmMatte;
  var LAMBERT = { spec: 0, shin: 1, diffuse: 1, ambient: 1 };
  function lightTerms(normal, rig, lightXf, mat, viewNormal) {
    let fr = rig.ambient * mat.ambient;
    let fg = fr;
    let fb = fr;
    let spec = 0;
    for (const l of rig.lights) {
      const dir = apply(lightXf, [-l.y, l.x, l.z]);
      const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
      const lx = -dir[0] / len;
      const ly = -dir[1] / len;
      const lz = -dir[2] / len;
      const d = Math.max(0, normal[0] * lx + normal[1] * ly + normal[2] * lz);
      if (l.diffuse) {
        fr += d * l.r * mat.diffuse;
        fg += d * l.g * mat.diffuse;
        fb += d * l.b * mat.diffuse;
      }
      if (mat.spec > 0) {
        const hl = Math.hypot(lx, ly, lz + 1) || 1;
        const nh = Math.max(
          0,
          (viewNormal[0] * lx + viewNormal[1] * ly + viewNormal[2] * (lz + 1)) / hl
        );
        spec += Math.pow(nh, mat.shin) * mat.spec * Math.max(l.r, l.g, l.b);
      }
    }
    if (mat.rim) {
      const facing = Math.min(1, Math.abs(viewNormal[2]));
      const k = mat.rim + (1 - mat.rim) * facing;
      fr *= k;
      fg *= k;
      fb *= k;
    }
    return { f: [fr, fg, fb], spec };
  }
  function shade3(base, normal, rig, lightXf, mat = LAMBERT, viewNormal = normal) {
    const { f, spec } = lightTerms(normal, rig, lightXf, mat, viewNormal);
    const s = spec * 255;
    return `#${toHex2(base[0] * f[0] + s)}${toHex2(base[1] * f[1] + s)}${toHex2(base[2] * f[2] + s)}`;
  }
  function flattenSvgPath(d, curveSegs = 10) {
    const toks = d.trim().split(/[\s,]+/);
    const rings = [];
    let ring = [];
    let x = 0;
    let y = 0;
    let i = 0;
    const segs = Number.isFinite(curveSegs) ? Math.min(Math.max(1, Math.floor(curveSegs)), 32) : 10;
    const num = () => {
      const v = Number(toks[i++]);
      return Number.isFinite(v) ? v : 0;
    };
    const closeRing = () => {
      if (ring.length >= 6) rings.push(ring);
      ring = [];
    };
    while (i < toks.length) {
      const t = toks[i++];
      switch (t) {
        case "M":
          closeRing();
          x = num();
          y = num();
          ring.push(x, y);
          break;
        case "L":
          x = num();
          y = num();
          ring.push(x, y);
          break;
        case "C": {
          const c1x = num();
          const c1y = num();
          const c2x = num();
          const c2y = num();
          const ex = num();
          const ey = num();
          for (let k = 1; k <= segs; k++) {
            const u = k / segs;
            const v = 1 - u;
            ring.push(
              v * v * v * x + 3 * v * v * u * c1x + 3 * v * u * u * c2x + u * u * u * ex,
              v * v * v * y + 3 * v * v * u * c1y + 3 * v * u * u * c2y + u * u * u * ey
            );
          }
          x = ex;
          y = ey;
          break;
        }
        case "Q": {
          const cx1 = num();
          const cy1 = num();
          const ex = num();
          const ey = num();
          for (let k = 1; k <= segs; k++) {
            const u = k / segs;
            const v = 1 - u;
            ring.push(
              v * v * x + 2 * v * u * cx1 + u * u * ex,
              v * v * y + 2 * v * u * cy1 + u * u * ey
            );
          }
          x = ex;
          y = ey;
          break;
        }
        case "Z":
        case "z":
          closeRing();
          break;
        default:
          if (t !== void 0 && Number.isFinite(Number(t))) {
            x = Number(t);
            y = num();
            ring.push(x, y);
          }
          break;
      }
    }
    closeRing();
    return rings.map((r) => {
      const o = [];
      for (let k = 0; k < r.length; k += 2) {
        const n = o.length;
        if (n >= 2 && Math.abs(o[n - 2] - r[k]) < 0.01 && Math.abs(o[n - 1] - r[k + 1]) < 0.01)
          continue;
        o.push(r[k], r[k + 1]);
      }
      while (o.length >= 4 && Math.abs(o[0] - o[o.length - 2]) < 0.01 && Math.abs(o[1] - o[o.length - 1]) < 0.01)
        o.splice(o.length - 2, 2);
      return o;
    });
  }
  function ellipseRing(w, h, segs = 48) {
    const out = [];
    for (let k = 0; k < segs; k++) {
      const a = k / segs * 2 * Math.PI;
      out.push(w / 2 * (1 + Math.cos(a)), h / 2 * (1 + Math.sin(a)));
    }
    return out;
  }
  function roundRectRing(w, h, r, segsPerCorner = 6) {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    if (rr < 0.5) return [0, 0, w, 0, w, h, 0, h];
    const out = [];
    const corner = (cx, cy, a0) => {
      for (let k = 0; k <= segsPerCorner; k++) {
        const a = a0 + k / segsPerCorner * (Math.PI / 2);
        out.push(cx + rr * Math.cos(a), cy + rr * Math.sin(a));
      }
    };
    corner(rr, rr, Math.PI);
    corner(w - rr, rr, -Math.PI / 2);
    corner(w - rr, h - rr, 0);
    corner(rr, h - rr, Math.PI / 2);
    return out;
  }
  function insideRings(rings, x, y) {
    let inside = false;
    for (const r of rings) {
      for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
        const xi = r[i];
        const yi = r[i + 1];
        const xj = r[j];
        const yj = r[j + 1];
        if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
      }
    }
    return inside;
  }
  function inPlaneRotationDeg(scene) {
    const preset = CAMERA_PRESETS[scene.cameraPreset];
    if (!preset) return null;
    if ((scene.extrusionEmu ?? 0) > 0) return null;
    if ((scene.zEmu ?? 0) !== 0) return null;
    const lat = scene.cameraRot ? scene.cameraRot.lat * D : preset.rx;
    const lon = scene.cameraRot ? scene.cameraRot.lon * D : preset.ry;
    const rev = scene.cameraRot ? scene.cameraRot.rev * D : preset.rz;
    const near = (a) => Math.abs((a % 360 + 360) % 360) < 0.5 || Math.abs((a % 360 + 360) % 360 - 360) < 0.5;
    if (!near(lat) || !near(lon)) return null;
    return rev === 0 ? 0 : -rev;
  }
  function flatCameraMirror(scene) {
    const preset = CAMERA_PRESETS[scene.cameraPreset];
    if (!preset || !preset.parallel || preset.skewAmount !== 0) return null;
    if ((scene.extrusionEmu ?? 0) > 0) return null;
    if ((scene.zEmu ?? 0) !== 0) return null;
    const lat = scene.cameraRot ? scene.cameraRot.lat * D : preset.rx;
    const lon = scene.cameraRot ? scene.cameraRot.lon * D : preset.ry;
    const rev = scene.cameraRot ? scene.cameraRot.rev * D : preset.rz;
    const norm = (a) => (a % 360 + 360) % 360;
    const isHalf = (a) => Math.abs(norm(a) - 180) < 0.5;
    const isZero = (a) => norm(a) < 0.5 || norm(a) > 359.5;
    const flipV = isHalf(lat);
    const flipH = isHalf(lon);
    if (!flipV && !isZero(lat) || !flipH && !isZero(lon)) return null;
    if (!flipH && !flipV && rev === 0) return null;
    return { flipH, flipV, rotationDeg: rev === 0 ? 0 : -rev };
  }
  function rigOf(scene) {
    const rig = LIGHT_RIGS[scene.lightRig ?? ""] ?? LIGHT_RIGS.threePt;
    let lightXf = IDENT;
    if (scene.lightRot) {
      const c = cameraMatrix(scene.lightRot.lat * D, scene.lightRot.lon * D, 0);
      lightXf = [c[0], c[3], c[6], c[1], c[4], c[7], c[2], c[5], c[8]];
    } else {
      const dirDeg = RIG_DIR_DEG[scene.lightDir ?? "t"] ?? 0;
      if (dirDeg) lightXf = rotZ(rad(dirDeg));
    }
    return { rig, lightXf };
  }
  var POWDER_TINT = {
    chilly: [51, 51, 59],
    threePt: [98, 98, 98],
    flat: [76, 76, 76],
    soft: [72, 72, 72],
    harsh: [65, 65, 65],
    balanced: [90, 90, 90],
    brightRoom: [67, 67, 67],
    glow: [54, 54, 54],
    contrasting: [54, 54, 54],
    twoPt: [83, 83, 83],
    flood: [55, 55, 55],
    freezing: [16, 25, 41],
    morning: [41, 37, 26],
    sunrise: [35, 29, 13],
    sunset: [37, 16, 0]
  };
  var POWDER_SCALE = 0.69;
  var POWDER_CAP = 227;
  var FACE_MUL = {
    glow: [0.98, 0.98, 0.98],
    contrasting: [0.98, 0.98, 0.98],
    twoPt: [0.97, 0.97, 0.97],
    flood: [0.85, 0.85, 0.85],
    freezing: [0.66, 0.75, 0.86],
    morning: [0.86, 0.84, 0.76],
    sunrise: [0.84, 0.78, 0.66],
    sunset: [0.85, 0.68, 0.53]
  };
  var BEVEL_RIG_SIGNS = {
    chilly: [-1, 1],
    threePt: [-1, 1],
    flat: [-1, 1],
    soft: [-1, 1],
    harsh: [-1, 1],
    balanced: [-1, 1],
    brightRoom: [-1, 1],
    glow: [1, 1],
    flood: [1, -1],
    freezing: [1, -1],
    morning: [1, -1],
    sunrise: [1, -1],
    sunset: [1, -1]
  };
  var alphaOf2 = (hex) => /^#[0-9a-fA-F]{8}$/.test(hex) ? hex.slice(7) : "";
  var rgbHex = (c, alpha = "") => `#${toHex2(c[0])}${toHex2(c[1])}${toHex2(c[2])}${alpha}`;
  function bevelMaterialFaceColor(fill, scene) {
    const rig = scene.lightRig ?? "threePt";
    const base = parseRgb(fill);
    if (scene.material !== "translucentPowder" && scene.material !== "powder") {
      const mul = scene.material === "flat" ? void 0 : FACE_MUL[rig];
      return mul ? rgbHex(
        base.map((v, i) => v * mul[i]),
        alphaOf2(fill)
      ) : fill;
    }
    const k = POWDER_TINT[rig];
    if (!k) return fill;
    const c = base.map((v, i) => Math.min(POWDER_CAP, v * POWDER_SCALE + k[i]));
    return rgbHex(c, alphaOf2(fill));
  }
  function bevelProfile(preset) {
    switch (preset) {
      case "relaxedInset":
        return [
          [0.5, -35],
          [1, 35]
        ];
      // probe: the chamfer presets light like an inward slope (top edge dark, bottom lit)
      case "angle":
      case "slope":
      case "hardEdge":
      case "coolSlant":
      case "artDeco":
        return [[1, -30]];
      case "convex":
      case "cross":
      case "divot":
      case "riblet":
        return [
          [0.5, 40],
          [1, 15]
        ];
      default:
        return [
          [0.12, 62],
          [0.25, 48],
          [0.4, 36],
          [0.55, 25],
          [0.72, 15],
          [0.87, 7],
          [1, 2]
        ];
    }
  }
  function norm2(x, y) {
    const l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  }
  function insetRing(ring, rings, d) {
    const n = ring.length / 2;
    const out = [];
    for (let i = 0; i < n; i++) {
      const px = ring[i * 2];
      const py = ring[i * 2 + 1];
      const pv = [ring[(i - 1 + n) % n * 2], ring[(i - 1 + n) % n * 2 + 1]];
      const nx = [ring[(i + 1) % n * 2], ring[(i + 1) % n * 2 + 1]];
      const e1 = norm2(px - pv[0], py - pv[1]);
      const e2 = norm2(nx[0] - px, nx[1] - py);
      let n1 = [e1[1], -e1[0]];
      let n2 = [e2[1], -e2[0]];
      const mx = (px + nx[0]) / 2;
      const my = (py + nx[1]) / 2;
      if (insideRings(rings, mx + n2[0] * 0.75, my + n2[1] * 0.75)) {
        n1 = [-n1[0], -n1[1]];
        n2 = [-n2[0], -n2[1]];
      }
      const b = norm2(n1[0] + n2[0], n1[1] + n2[1]);
      const cosHalf = Math.max(0.35, b[0] * n1[0] + b[1] * n1[1]);
      out.push(px - b[0] * d / cosHalf, py - b[1] * d / cosHalf);
    }
    return out;
  }
  function buildBevelFaces(input) {
    const { rings, w, h, scene } = input;
    const outer = rings[0];
    if (!outer || outer.length < 6 || input.bevelPx <= 0) return null;
    if (scene.material === "flat" || scene.material === "legacyMatte") return null;
    const signs = BEVEL_RIG_SIGNS[scene.lightRig ?? "threePt"];
    if (!signs) return null;
    const bw = Math.min(input.bevelPx, w / 2, h / 2);
    const { rig, lightXf: rigXf } = rigOf(scene);
    const revDeg = -(scene.lightRot?.rev ?? 0) * D;
    const lightXf = revDeg ? matMul(rotZ(rad(revDeg)), rigXf) : rigXf;
    const alpha = alphaOf2(input.frontColor);
    const face = parseRgb(bevelMaterialFaceColor(input.frontColor, scene));
    const powder = scene.material === "translucentPowder" || scene.material === "powder";
    const bandMat = MATERIALS.matte;
    const gain = powder ? 0.5 : 0.7;
    const flatT = lightTerms([0, 0, 1], rig, lightXf, bandMat, [0, 0, 1]);
    const relative = (normal) => {
      const lit = lightTerms(normal, rig, lightXf, bandMat, normal);
      const c = face.map((v, i) => {
        const flatV = v * flatT.f[i] + flatT.spec * 255;
        const litV = v * lit.f[i] + lit.spec * 255;
        const ratio = flatV > 0 ? litV / flatV : 1;
        return v * (1 + (ratio - 1) * gain);
      });
      return rgbHex(c, alpha);
    };
    const rnd = (v) => Math.round(v * 100) / 100;
    const poly = (pts) => {
      let d = "";
      for (let i = 0; i < pts.length; i += 2)
        d += `${i ? " L" : "M"} ${rnd(pts[i])} ${rnd(pts[i + 1])}`;
      return d + " Z";
    };
    const out = [];
    const n = outer.length / 2;
    const normals = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ex = outer[j * 2] - outer[i * 2];
      const ey = outer[j * 2 + 1] - outer[i * 2 + 1];
      const el = Math.hypot(ex, ey);
      if (el < 1e-6) {
        normals.push(null);
        continue;
      }
      let nx = ey / el;
      let ny = -ex / el;
      const mx = (outer[i * 2] + outer[j * 2]) / 2;
      const my = (outer[i * 2 + 1] + outer[j * 2 + 1]) / 2;
      if (insideRings(rings, mx + nx * 0.75, my + ny * 0.75)) {
        nx = -nx;
        ny = -ny;
      }
      normals.push([nx, ny]);
    }
    let prevRing = outer;
    for (const [pos, angleDeg] of bevelProfile(scene.bevelTop?.preset ?? "circle")) {
      const ring = insetRing(outer, rings, pos * bw);
      const sin = Math.sin(rad(Math.abs(angleDeg)));
      const cos = Math.cos(rad(Math.abs(angleDeg)));
      const sign = angleDeg < 0 ? -1 : 1;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const nrm = normals[i];
        if (!nrm) continue;
        const nx = signs[0] * nrm[0];
        const ny = signs[1] * nrm[1];
        out.push({
          path: poly([
            prevRing[i * 2],
            prevRing[i * 2 + 1],
            prevRing[j * 2],
            prevRing[j * 2 + 1],
            ring[j * 2],
            ring[j * 2 + 1],
            ring[i * 2],
            ring[i * 2 + 1]
          ]),
          color: relative([nx * sin * sign, ny * sin * sign, cos])
        });
      }
      prevRing = ring;
    }
    out.push({
      path: [prevRing, ...rings.slice(1)].map(poly).join(" "),
      color: input.frontUsesFill ? input.frontColor : rgbHex(face, alpha),
      ...input.frontUsesFill ? { front: true } : {}
    });
    if (input.strokeColor) {
      out.push({
        path: rings.map(poly).join(" "),
        color: "transparent",
        stroke: input.strokeColor,
        strokeWidthPx: input.strokeWidthPx ?? 1
      });
    }
    return { faces: out, shadowPath: rings.map(poly).join(" "), flat: true };
  }
  function buildExtrusion(input) {
    const { rings, w, h, depthPx, scene } = input;
    const preset = CAMERA_PRESETS[scene.cameraPreset];
    if (!preset || !rings.length || depthPx < 0) return null;
    const lat = scene.cameraRot ? scene.cameraRot.lat * D : preset.rx;
    const lon = scene.cameraRot ? scene.cameraRot.lon * D : preset.ry;
    const rev = scene.cameraRot ? scene.cameraRot.rev * D : preset.rz;
    const m = cameraMatrix(lat, lon, rev);
    const cx = w / 2;
    const cy = h / 2;
    const zOff = input.zPx;
    const faces = [];
    const frontRings = [];
    const backRings = [];
    for (const ring of rings) {
      const fr = [];
      const br = [];
      for (let i = 0; i < ring.length; i += 2) {
        fr.push([ring[i] - cx, ring[i + 1] - cy, zOff]);
        br.push([ring[i] - cx, ring[i + 1] - cy, zOff - depthPx]);
      }
      frontRings.push(fr);
      backRings.push(br);
      if (depthPx <= 0) continue;
      for (let i = 0; i < fr.length; i++) {
        const j = (i + 1) % fr.length;
        const ex = fr[j][0] - fr[i][0];
        const ey = fr[j][1] - fr[i][1];
        const elen = Math.hypot(ex, ey);
        if (elen < 1e-6) continue;
        let nx = ey / elen;
        let ny = -ex / elen;
        const mx = (fr[i][0] + fr[j][0]) / 2 + cx;
        const my = (fr[i][1] + fr[j][1]) / 2 + cy;
        if (insideRings(rings, mx + nx * 0.75, my + ny * 0.75)) {
          nx = -nx;
          ny = -ny;
        }
        faces.push({ verts: [fr[i], fr[j], br[j], br[i]], normal: [nx, ny, 0], kind: "side" });
      }
    }
    const shapeNormals = faces.map((f) => f.normal);
    for (const f of faces) {
      f.verts = f.verts.map((v) => apply(m, v));
      f.normal = apply(m, f.normal);
    }
    const frontR = frontRings.map((r) => r.map((v) => apply(m, v)));
    const backR = backRings.map((r) => r.map((v) => apply(m, v)));
    const frontNormal = apply(m, [0, 0, 1]);
    const backNormal = apply(m, [0, 0, -1]);
    const eyeDist = preset.vz * PX_PER_MM100;
    const eyeX = preset.vx * PX_PER_MM100;
    const eyeY = preset.vy * PX_PER_MM100;
    const skew = preset.skewAmount / 100;
    const skewA = rad(preset.skewAngle);
    const origX = preset.ox * w;
    const origY = preset.oy * h;
    const project = (v) => {
      if (preset.parallel) {
        return [v[0] - v[2] * skew * Math.cos(skewA) + cx, v[1] - v[2] * skew * Math.sin(skewA) + cy];
      }
      const s = eyeDist / Math.max(eyeDist - (v[2] - 0), 1);
      return [
        origX + eyeX + (v[0] - origX - eyeX) * s + cx,
        origY + eyeY + (v[1] - origY - eyeY) * s + cy
      ];
    };
    const { rig, lightXf } = rigOf(scene);
    const frontBase = parseRgb(input.frontColor);
    const sideBase = parseRgb(scene.extrusionColor ?? input.sideColor);
    const wireframe = scene.material === "legacyWireframe";
    const mat = scene.material ? MATERIALS[scene.material] ?? DEFAULT_MATERIAL : LAMBERT;
    const capMat = { ...mat, spec: 0 };
    const out = [];
    const rnd = (n) => Math.round(n * 100) / 100;
    const ringPath = (verts) => {
      const pts = verts.map(project);
      return `M ${pts.map((p) => `${rnd(p[0])} ${rnd(p[1])}`).join(" L ")} Z`;
    };
    const capPath = (ringsOf) => ringsOf.map(ringPath).join(" ");
    const meanZ = (verts) => verts.reduce((s, v) => s + v[2], 0) / verts.length;
    if (wireframe) {
      const sw = Math.max(input.strokeWidthPx ?? 1, 0.75);
      const stroke = input.strokeColor ?? "#000000";
      out.push({ path: capPath(backR), color: "transparent", stroke, strokeWidthPx: sw });
      for (let ri = 0; ri < frontR.length; ri++) {
        const fr = frontR[ri];
        const br = backR[ri];
        for (let i = 0; i < fr.length; i++) {
          const prev = fr[(i - 1 + fr.length) % fr.length];
          const next = fr[(i + 1) % fr.length];
          const a1 = Math.atan2(fr[i][1] - prev[1], fr[i][0] - prev[0]);
          const a2 = Math.atan2(next[1] - fr[i][1], next[0] - fr[i][0]);
          let da = Math.abs(a1 - a2);
          if (da > Math.PI) da = 2 * Math.PI - da;
          if (da < rad(20)) continue;
          const p1 = project(fr[i]);
          const p2 = project(br[i]);
          out.push({
            path: `M ${rnd(p1[0])} ${rnd(p1[1])} L ${rnd(p2[0])} ${rnd(p2[1])}`,
            color: "transparent",
            stroke,
            strokeWidthPx: sw
          });
        }
      }
      out.push({ path: capPath(frontR), color: "transparent", stroke, strokeWidthPx: sw });
      return { faces: out, wireframe: true };
    }
    const viewDirAt = (verts) => {
      if (preset.parallel) return [skew * Math.cos(skewA), skew * Math.sin(skewA), 1];
      const cxv = verts.reduce((s, v) => s + v[0], 0) / verts.length;
      const cyv = verts.reduce((s, v) => s + v[1], 0) / verts.length;
      const czv = verts.reduce((s, v) => s + v[2], 0) / verts.length;
      return [eyeX + origX - cxv, eyeY + origY - cyv, eyeDist - czv];
    };
    const facing = (normal, verts) => {
      const vd = viewDirAt(verts);
      return normal[0] * vd[0] + normal[1] * vd[1] + normal[2] * vd[2] > 0;
    };
    const legacy = preset.skewAmount > 0 || scene.cameraPreset.startsWith("legacy");
    if (backR[0] && facing(backNormal, backR[0])) {
      out.push({
        path: capPath(backR),
        color: legacy ? shade3(sideBase, backNormal, rig, lightXf, capMat) : shade3(frontBase, [0, 0, -1], rig, lightXf, capMat, backNormal)
      });
    }
    const wallIdx = faces.map((f, i) => i).filter((i) => facing(faces[i].normal, faces[i].verts)).sort((a, b) => meanZ(faces[a].verts) - meanZ(faces[b].verts));
    for (const i of wallIdx) {
      const f = faces[i];
      out.push({
        path: ringPath(f.verts),
        color: shade3(sideBase, legacy ? f.normal : shapeNormals[i], rig, lightXf, mat, f.normal)
      });
    }
    if (frontR[0] && facing(frontNormal, frontR[0])) {
      out.push({
        path: capPath(frontR),
        color: input.frontUsesFill ? input.frontColor : shade3(frontBase, legacy ? frontNormal : [0, 0, 1], rig, lightXf, capMat, frontNormal),
        ...input.frontUsesFill ? { front: true } : {},
        ...input.strokeColor ? { stroke: input.strokeColor, strokeWidthPx: input.strokeWidthPx ?? 1 } : {}
      });
    }
    return { faces: out, ...frontR[0] ? { shadowPath: capPath(frontR) } : {} };
  }

  // ../genoffice/packages/pptx-render/src/build-slide.ts
  function withSlideNum(el, num) {
    if (el.type === "group") {
      const g = el;
      const children = g.children.map((c) => withSlideNum(c, num));
      return children.some((c, i) => c !== g.children[i]) ? { ...g, children } : el;
    }
    const text = el.text;
    const hit = text?.paragraphs.some(
      (p) => p.runs.some((r) => r.field === "slidenum" && r.text !== String(num))
    );
    if (!hit) return el;
    return {
      ...el,
      text: {
        ...text,
        paragraphs: text.paragraphs.map((p) => ({
          ...p,
          runs: p.runs.map((r) => r.field === "slidenum" ? { ...r, text: String(num) } : r)
        }))
      }
    };
  }
  var CHIP_LABEL = {
    chart: "Chart",
    table: "Table",
    smartart: "SmartArt",
    ole: "Embedded object",
    connector: "Connector",
    media: "Media",
    unknown: "Unsupported element"
  };
  function metafileDcColor(isMetafile, cc) {
    if (!isMetafile) return void 0;
    if (!cc || !cc.from.toUpperCase().startsWith("#FFFFFF")) return { bgColor: "#FFFFFF" };
    const alpha = cc.to.length >= 9 ? parseInt(cc.to.slice(7, 9), 16) : 255;
    return alpha > 0 ? { bgColor: cc.to } : void 0;
  }
  function buildRenderSlide(slide, size, opts) {
    const vp = makeViewport(size, opts.fitWidthPx);
    const metrics = opts.metrics ?? new HeuristicMetrics();
    const subNum = opts.slideNo != null ? (el) => withSlideNum(el, opts.slideNo) : (el) => el;
    const subBg = (e) => {
      if (e.type === "group") {
        const g = e;
        const children = g.children.map(subBg);
        return children.some((c, i) => c !== g.children[i]) ? { ...g, children } : e;
      }
      return (e.type === "shape" || e.type === "text") && e.useBgFill && slide.background ? { ...e, fill: slide.background } : e;
    };
    const sub = (el) => subBg(subNum(el));
    const nodes = [];
    for (const el of slide.decorations ?? []) {
      const node = buildNode(sub(el), vp, metrics, opts.media, { x: 0, y: 0 });
      if (node && node.type !== "placeholder-chip") {
        node.decoration = true;
        nodes.push(node);
      }
    }
    let bgLeading = 0;
    while (bgLeading < slide.elements.length && isBackgroundLikeElement2(slide.elements[bgLeading], size)) {
      bgLeading += 1;
    }
    for (const [i, el] of slide.elements.entries()) {
      const node = buildNode(sub(el), vp, metrics, opts.media, { x: 0, y: 0 });
      if (node) {
        if (i < bgLeading) node.background = true;
        nodes.push(node);
      }
    }
    const sldOpen = /<p:sld\b[^>]*>/.exec(slide.bodyPrefix)?.[0];
    const hidden = !!sldOpen && /\sshow="0"/.test(sldOpen);
    return {
      widthPx: vp.widthPx,
      heightPx: vp.heightPx,
      scale: vp.scale,
      background: resolveFill(slide.background, vp, opts.media),
      ...slide.bgOwn ? { bgOwn: true } : {},
      ...slide.masterSpHidden ? { bgGraphicsHidden: true } : {},
      nodes,
      ...hidden ? { hidden: true } : {},
      partPath: slide.path
    };
  }
  function buildNode(el, vp, metrics, media, parentOffset, parentGroup) {
    const node = buildNodeInner(el, vp, metrics, media, parentOffset);
    if (node) {
      const durable = parentGroup ? groupChildDurableId2(parentGroup, el) : elementDurableId2(el);
      if (durable) node.durableId = durable;
    }
    return node;
  }
  function buildNodeInner(el, vp, metrics, media, parentOffset) {
    const box = placeTransform(el.transform, vp, parentOffset);
    switch (el.type) {
      case "text":
      case "shape":
        return buildShape(el, box, vp, metrics, media);
      case "picture":
        return buildPicture(el, box, vp, media);
      case "group":
        return buildGroup(el, box, vp, metrics, media);
      case "table":
        return buildTable(el, box, vp, metrics, media);
      case "chart": {
        const chartEl = el;
        const appCreated = chartEl.descr === "aislides-chart";
        const node = buildChartNode(`r_${el.id}`, el.id, chartEl.chart, box, vp, metrics, media) ?? chipNode(el.id, box, "chart", CHIP_LABEL["chart"]);
        if (appCreated && node.type === "chart") {
          ;
          node.appCreated = true;
        }
        if (node.type === "chart") {
          ;
          node.styleInfo = chartStyleInfo(chartEl.chart);
          if (chartEl.chart.bgFill) {
            const bg = resolveFill(chartEl.chart.bgFill, vp, media);
            if (bg.kind !== "none") node.bgFill = bg;
          }
          if (chartEl.chart.border) {
            ;
            node.border = {
              color: chartEl.chart.border.color,
              widthPx: emuToPx(chartEl.chart.border.widthEmu, vp.scale)
            };
          }
          const plotRect = node.plotRect;
          if (plotRect && chartEl.chart.plotFill) {
            const f = resolveFill(chartEl.chart.plotFill, vp, media);
            if (f.kind !== "none") plotRect.fill = f;
          }
          for (const ul of chartEl.chart.userLines ?? []) {
            ;
            node.axisLines.push({
              x1: ul.x1 * box.w,
              y1: ul.y1 * box.h,
              x2: ul.x2 * box.w,
              y2: ul.y2 * box.h,
              color: ul.color,
              widthPx: Math.max(emuToPx(ul.widthEmu, vp.scale), 0.75)
            });
          }
        }
        return node;
      }
      case "passthrough": {
        const pt = el;
        if (pt.previewShapes?.length) {
          const fx = pt.transform.offset.cx;
          const fy = pt.transform.offset.cy;
          let bx = 0;
          let by = 0;
          for (const sh of pt.previewShapes) {
            const o = sh.transform?.offset;
            if (!o) continue;
            const th = (sh.transform?.rot ?? 0) / 6e4 * Math.PI / 180;
            const hw = Math.abs(o.cx / 2 * Math.cos(th)) + Math.abs(o.cy / 2 * Math.sin(th));
            const hh = Math.abs(o.cx / 2 * Math.sin(th)) + Math.abs(o.cy / 2 * Math.cos(th));
            bx = Math.max(bx, o.x + o.cx / 2 + hw);
            by = Math.max(by, o.y + o.cy / 2 + hh);
          }
          const pseudo = {
            id: pt.id,
            type: "group",
            anchor: pt.anchor,
            transform: pt.transform,
            children: pt.previewShapes,
            // Small overshoots are intentional bleed (rotated accent lines cross the frame
            // edge; PowerPoint keeps them) - only a gross overflow marks a stale cache
            // (tdf-style resized frames overflow 2x+)
            childOffset: {
              x: 0,
              y: 0,
              cx: bx > fx * 1.2 ? bx : fx,
              cy: by > fy * 1.2 ? by : fy
            }
          };
          return buildGroup(pseudo, box, vp, metrics, media);
        }
        if (pt.previewPicture) {
          const pic = buildPicture({ ...pt.previewPicture, id: pt.id }, box, vp, media);
          if (pic?.type === "picture") pic.bgColor = "#FFFFFF";
          return pic;
        }
        if (pt.noChip) return null;
        return buildChip(pt, box);
      }
      default:
        return null;
    }
  }
  function resolveArrowEnd(end, strokeWidthEmu, scale2) {
    const lw = Math.max(emuToPx(strokeWidthEmu, scale2), 1);
    const sizeMultW = end.w === "sm" ? 2 : end.w === "lg" ? 5 : 3;
    const sizeMultL = end.len === "sm" ? 2 : end.len === "lg" ? 5 : 3;
    return {
      type: end.type,
      widthPx: Math.max(lw * sizeMultW, 4),
      lengthPx: Math.max(lw * sizeMultL, 4)
    };
  }
  function scaleUnitPath(d, w, h) {
    let i = 0;
    return d.split(" ").map((tok) => {
      const n = Number(tok);
      if (!Number.isFinite(n)) return tok;
      return String(Math.round(n * (i++ % 2 === 0 ? w : h) * 100) / 100);
    }).join(" ");
  }
  function buildShape(el, box, vp, metrics, media) {
    const node = {
      id: `r_${el.id}`,
      type: el.type,
      box,
      sourceId: el.id,
      fill: resolveFill(el.fill, vp, media),
      ...el.fillOverlay ? { fillOverlay: resolveFill(el.fillOverlay, vp, media) } : {},
      ...el.placeholder ? { placeholder: el.placeholder } : {},
      ...el.txBox ? { txBox: true } : {},
      ...el.presetGeometry ? { presetGeometry: el.presetGeometry } : {},
      ...el.softEdge ? { softEdgePx: emuToPx(el.softEdge, vp.scale) } : {}
    };
    if (el.adjust) node.adjust = { ...el.adjust };
    if (el.customGeometry) {
      const g = el.customGeometry;
      if (g.path) node.pathData = scaleUnitPath(g.path, box.w, box.h);
      if (g.fillPath) node.fillPathData = scaleUnitPath(g.fillPath, box.w, box.h);
      if (g.strokePath) node.strokePathData = scaleUnitPath(g.strokePath, box.w, box.h);
    } else if (el.presetGeometry === "roundRect") {
      const adj = el.adjust?.adj ?? 16667;
      node.cornerRadiusPx = Math.min(box.w, box.h) * Math.min(Math.max(adj, 0), 5e4) / 1e5;
    } else if (isPillPreset(el.presetGeometry)) {
      node.cornerRadiusPx = Math.min(box.w, box.h) / 2;
    } else if (isConnectorPreset(el.presetGeometry)) {
      const pts = connectorPoints(el.presetGeometry, box.w, box.h, box.flipH, box.flipV, el.adjust);
      const isCurved = /^curvedConnector/.test(el.presetGeometry ?? "");
      const bezier = isCurved ? connectorBezier(pts) : void 0;
      const strokeWidth = el.stroke?.width ?? 12700;
      node.line = {
        points: pts,
        ...bezier?.length ? { bezier } : {},
        ...el.stroke?.headEnd ? { headEnd: resolveArrowEnd(el.stroke.headEnd, strokeWidth, vp.scale) } : {},
        ...el.stroke?.tailEnd ? { tailEnd: resolveArrowEnd(el.stroke.tailEnd, strokeWidth, vp.scale) } : {}
      };
      node.box = { ...box, flipH: false, flipV: false };
    } else if (el.presetGeometry && el.presetGeometry !== "rect") {
      const poly = presetPolygon(el.presetGeometry, box.w, box.h, el.adjust);
      if (poly) node.polygonPoints = poly;
      else {
        const p = presetPath(el.presetGeometry, box.w, box.h, el.adjust);
        if (p) {
          if (p.path) node.pathData = p.path;
          if (p.fillPath) node.fillPathData = p.fillPath;
          if (p.strokePath) node.strokePathData = p.strokePath;
        }
      }
    }
    if (el.noGeometry) node.fill = { kind: "none" };
    const stroke = el.noGeometry ? void 0 : resolveStroke(el.stroke, vp);
    if (stroke) node.stroke = stroke;
    const shadow = resolveShadow(el.shadow, vp);
    if (shadow) node.shadow = shadow;
    const glow = resolveGlow(el.glow, vp);
    if (glow) node.glow = glow;
    const reflection = resolveReflection(el.reflection, vp);
    if (reflection) node.reflection = reflection;
    if (el.scene3d) applyScene3D(el, node, vp);
    if (el.text && el.text.paragraphs.length) {
      node.text = layoutText({
        body: el.text,
        boxWidthPx: box.w,
        boxHeightPx: box.h,
        metrics,
        vp,
        media
      });
    }
    return node;
  }
  function applyScene3D(el, node, vp) {
    if (node.line) return;
    const scene = el.scene3d;
    const spin = inPlaneRotationDeg(scene);
    const depthPx = emuToPx(scene.extrusionEmu ?? 0, vp.scale);
    const box = node.box;
    let rings;
    if (node.pathData ?? node.fillPathData)
      rings = flattenSvgPath(node.pathData ?? node.fillPathData);
    else if (node.polygonPoints) rings = [node.polygonPoints];
    else if (node.presetGeometry === "ellipse" || node.presetGeometry === "circle")
      rings = [ellipseRing(box.w, box.h)];
    else if (node.cornerRadiusPx != null) rings = [roundRectRing(box.w, box.h, node.cornerRadiusPx)];
    else rings = [[0, 0, box.w, 0, box.w, box.h, 0, box.h]];
    if (!rings.length) return;
    const fill = node.fill;
    const frontSolid = fill.kind === "solid" ? fill.color : void 0;
    const gradientMid = fill.kind === "gradient" && fill.stops.length ? fill.stops[Math.floor(fill.stops.length / 2)].color : void 0;
    const frontColor = frontSolid ?? gradientMid ?? "#FFFFFF";
    if (spin != null) {
      if (spin !== 0) node.box = { ...node.box, rotationDeg: node.box.rotationDeg + spin };
      if (depthPx <= 0 && fill.kind !== "none") {
        const bev = scene.bevelTop ? buildBevelFaces({
          rings,
          w: box.w,
          h: box.h,
          scene,
          frontColor,
          bevelPx: emuToPx(scene.bevelTop.wEmu, vp.scale),
          ...node.stroke ? { strokeColor: node.stroke.color, strokeWidthPx: node.stroke.widthPx } : {},
          ...fill.kind !== "solid" ? { frontUsesFill: true } : {}
        }) : null;
        if (bev) node.extrusion = bev;
        else if (fill.kind === "solid") {
          const tinted = bevelMaterialFaceColor(fill.color, scene);
          if (tinted !== fill.color) node.fill = { ...fill, color: tinted };
        }
      }
      return;
    }
    const sideColor = scene.extrusionColor ?? node.stroke?.color ?? frontColor;
    const ext = buildExtrusion({
      rings,
      w: box.w,
      h: box.h,
      depthPx,
      zPx: emuToPx(scene.zEmu ?? 0, vp.scale),
      scene,
      frontColor,
      sideColor,
      ...node.stroke ? { strokeColor: node.stroke.color, strokeWidthPx: node.stroke.widthPx } : {},
      ...fill.kind !== "solid" ? { frontUsesFill: true } : {}
    });
    if (ext) node.extrusion = ext;
  }
  function pictureClip(preset, box, adjust) {
    if (!preset || preset === "rect") return void 0;
    if (preset === "roundRect") {
      const adj = adjust?.adj ?? 16667;
      return { cornerRadiusPx: Math.min(box.w, box.h) * Math.min(Math.max(adj, 0), 5e4) / 1e5 };
    }
    if (isPillPreset(preset)) return { cornerRadiusPx: Math.min(box.w, box.h) / 2 };
    if (preset === "ellipse") {
      const rx = box.w / 2;
      const ry = box.h / 2;
      return {
        pathData: `M 0 ${ry} A ${rx} ${ry} 0 1 0 ${box.w} ${ry} A ${rx} ${ry} 0 1 0 0 ${ry} Z`
      };
    }
    const poly = presetPolygon(preset, box.w, box.h, adjust);
    if (poly) return { polygonPoints: poly };
    const p = presetPath(preset, box.w, box.h, adjust);
    if (p?.path) return { pathData: p.path };
    return void 0;
  }
  function buildPicture(el, box, vp, media) {
    const dataUrl = el.dataUrl ?? (el.mediaRef ? media?.(el.mediaRef) : void 0);
    const geomPath = el.customGeometry ? el.customGeometry.path ?? el.customGeometry.fillPath : void 0;
    const clip = geomPath ? { pathData: scaleUnitPath(geomPath, box.w, box.h) } : pictureClip(el.presetGeometry, box, el.adjust);
    if (el.scene3d) {
      const m = flatCameraMirror(el.scene3d);
      if (m)
        box = {
          ...box,
          flipH: box.flipH !== m.flipH,
          flipV: box.flipV !== m.flipV,
          rotationDeg: box.rotationDeg + m.rotationDeg
        };
    }
    const isMetafile = typeof dataUrl === "string" && /^data:image\/(x-)?(emf|wmf|emz|wmz)[;,]/.test(dataUrl);
    const node = {
      id: `r_${el.id}`,
      type: "picture",
      box,
      sourceId: el.id,
      ...dataUrl ? { dataUrl } : {},
      ...clip ? { clip } : {},
      ...el.srcRect ? { srcRect: el.srcRect } : {},
      ...el.opacity != null ? { opacity: el.opacity } : {},
      ...el.softEdge ? { softEdgePx: emuToPx(el.softEdge, vp.scale) } : {},
      ...el.media ? { media: el.media.kind } : {},
      ...el.name ? { name: el.name } : {},
      ...el.descr ? { descr: el.descr } : {},
      ...el.fill && el.fill.type !== "none" ? { fill: resolveFill(el.fill, vp, media) } : {},
      // clrChange applies to the metafile playback result including that white DC:
      // a clrChange keyed to white recolors the backing (an alpha-0 target drops it —
      // tdf113163's black master bg shows through); other keys leave the DC white
      ...metafileDcColor(isMetafile, el.clrChange) ?? {},
      ...el.duotone ? { duotone: el.duotone } : {},
      ...el.lum ? { lum: el.lum } : {},
      ...el.clrChange ? { clrChange: el.clrChange } : {},
      ...el.biLevel != null ? { biLevel: el.biLevel } : {}
    };
    const stroke = resolveStroke(el.stroke, vp);
    if (stroke) node.stroke = stroke;
    const shadow = resolveShadow(el.shadow, vp);
    if (shadow) node.shadow = shadow;
    const glow = resolveGlow(el.glow, vp);
    if (glow) node.glow = glow;
    const reflection = resolveReflection(el.reflection, vp);
    if (reflection) node.reflection = reflection;
    return node;
  }
  function buildGroup(el, box, vp, metrics, media) {
    const ch = el.childOffset;
    const chX = ch?.x ?? el.transform.offset.x;
    const chY = ch?.y ?? el.transform.offset.y;
    const chCx = ch?.cx || el.transform.offset.cx;
    const chCy = ch?.cy || el.transform.offset.cy;
    const chWpx = emuToPx(chCx, vp.scale);
    const chHpx = emuToPx(chCy, vp.scale);
    const childScaleX = chWpx > 0 ? box.w / chWpx : 1;
    const childScaleY = chHpx > 0 ? box.h / chHpx : 1;
    const parentOffset = {
      x: -emuToPx(chX, vp.scale) * childScaleX,
      y: -emuToPx(chY, vp.scale) * childScaleY,
      scaleX: childScaleX,
      scaleY: childScaleY
    };
    const children = [];
    for (const child of el.children ?? []) {
      const c = buildNode(child, vp, metrics, media, parentOffset, el);
      if (c) children.push(c);
    }
    return {
      id: `r_${el.id}`,
      type: "group",
      box,
      sourceId: el.id,
      children,
      ...Math.abs(childScaleX - 1) > 1e-6 ? { childScaleX } : {},
      ...Math.abs(childScaleY - 1) > 1e-6 ? { childScaleY } : {}
    };
  }
  function buildTable(el, box, vp, metrics, media) {
    const extWpx = emuToPx(el.transform?.offset.cx ?? 0, vp.scale);
    const extHpx = emuToPx(el.transform?.offset.cy ?? 0, vp.scale);
    const groupScaleX = extWpx > 0 ? box.w / extWpx : 1;
    const groupScaleY = extHpx > 0 ? box.h / extHpx : 1;
    const colPx = el.colWidths.map((w) => emuToPx(w, vp.scale) * groupScaleX);
    const rowPx = el.rowHeights.map((h) => emuToPx(h, vp.scale) * groupScaleY);
    const colX = [0];
    for (const w of colPx) colX.push(colX[colX.length - 1] + w);
    const totalW = colX[colX.length - 1];
    if (Math.abs(totalW - box.w) > 0.5) box = { ...box, w: totalW };
    el.rows.forEach((row, r) => {
      const gridCols = tableRowGridCols2(row);
      row.forEach((cell, tcIdx) => {
        const cIdx = gridCols[tcIdx];
        if (cell.merged || (cell.rowSpan ?? 1) > 1) return;
        if (!cell.text || !cell.text.paragraphs.length) return;
        const x = colX[cIdx] ?? 0;
        const w = (colX[Math.min(cIdx + (cell.gridSpan ?? 1), colX.length - 1)] ?? x) - x;
        const probe = layoutText({
          body: cell.text,
          boxWidthPx: w,
          boxHeightPx: rowPx[r] ?? 0,
          metrics,
          vp,
          media,
          trimEdgeSpacing: true
        });
        const needed = (probe.inkBottom ?? probe.contentHeight) + probe.insets.t + probe.insets.b;
        if (needed > (rowPx[r] ?? 0)) rowPx[r] = needed;
      });
    });
    const rowY = [0];
    for (const h of rowPx) rowY.push(rowY[rowY.length - 1] + h);
    const totalH = rowY[rowY.length - 1];
    if (totalH > box.h + 0.5) box = { ...box, h: totalH };
    const cells = [];
    el.rows.forEach((row, r) => {
      const gridCols = tableRowGridCols2(row);
      row.forEach((cell, tcIdx) => {
        const cIdx = gridCols[tcIdx];
        const gridSpan = cell.gridSpan ?? 1;
        if (cell.merged) return;
        const rowSpan = cell.rowSpan ?? 1;
        const xLogical = colX[cIdx] ?? 0;
        const y = rowY[r] ?? 0;
        const w = (colX[Math.min(cIdx + gridSpan, colX.length - 1)] ?? xLogical) - xLogical;
        const h = (rowY[Math.min(r + rowSpan, rowY.length - 1)] ?? y) - y;
        const x = el.rtl ? totalW - xLogical - w : xLogical;
        const out = {
          x,
          y,
          w,
          h,
          row: r,
          col: tcIdx,
          ...gridSpan > 1 ? { gridSpan } : {},
          ...rowSpan > 1 ? { rowSpan } : {},
          // PowerPoint anchors a cell's tiled picture to the table box, not the cell: each
          // cell shows the part of the picture under it (photo-mosaic layout)
          fill: resolveFill(cell.fill, vp, media, { x: -x, y: -y, w: totalW, h: totalH })
        };
        if (cell.bevel && out.fill.kind === "solid") {
          const bw = Math.min(emuToPx(cell.bevel.widthEmu, vp.scale), w / 2, h / 2);
          if (bw >= 0.5) {
            out.bevel = buildCellBevel(out.fill.color, bw, cell.bevel.preset, cell.bevel.lightDir);
            out.fill = { kind: "solid", color: bevelFaceColor(out.fill.color) };
          }
        }
        const borders = {};
        for (const k of ["l", "r", "t", "b"]) {
          const s = resolveStroke(cell.borders?.[k], vp);
          if (s) borders[el.rtl && k === "l" ? "r" : el.rtl && k === "r" ? "l" : k] = s;
        }
        if (Object.keys(borders).length) out.borders = borders;
        if (cell.text && cell.text.paragraphs.length) {
          out.text = layoutText({
            body: cell.text,
            boxWidthPx: w,
            boxHeightPx: h,
            metrics,
            vp,
            media,
            trimEdgeSpacing: true
          });
        }
        cells.push(out);
      });
    });
    return {
      id: `r_${el.id}`,
      type: "table",
      box,
      sourceId: el.id,
      cells,
      ...el.bgFill ? { bgFill: resolveFill(el.bgFill, vp, media) } : {},
      gridX: colX,
      gridY: rowY,
      ...el.rtl ? { rtl: true } : {},
      ...el.styleFlags ? { styleFlags: el.styleFlags } : {}
    };
  }
  function chartStyleInfo(m) {
    const kind = m.kind === "bar" ? m.series.some((s) => s.plotKind === "line") ? "comboBarLine" : m.grouping === "stacked" || m.grouping === "percentStacked" ? "barStacked" : m.pseudo3D ? "bar3D" : "bar" : m.kind === "pie" ? (m.holePct ?? 0) > 0 ? "doughnut" : m.pseudo3D ? "pie3D" : "pie" : m.kind === "funnel" || m.kind === "sunburst" ? "unknown" : m.kind;
    return {
      kind,
      legendPos: m.legendPos == null ? "none" : m.legendPos === "tr" ? "r" : m.legendPos,
      dataLabels: !!m.dataLabels,
      gridlines: !!m.valAxis?.gridColor,
      ...m.title ? { title: m.title } : {},
      ...m.catAxis?.title ? { catAxisTitle: m.catAxis.title } : {},
      ...m.valAxis?.title ? { valAxisTitle: m.valAxis.title } : {},
      ...m.gapWidthPct != null ? { gapWidthPct: m.gapWidthPct } : {}
    };
  }
  function buildChip(el, box) {
    return chipNode(el.id, box, el.kind, CHIP_LABEL[el.kind] ?? el.kind);
  }
  function chipNode(sourceId, box, kind, label) {
    return {
      id: `r_${sourceId}`,
      type: "placeholder-chip",
      box,
      sourceId,
      kind,
      label
    };
  }

  // src/fonts.ts
  var FALLBACKS = ['"Helvetica Neue"', "Arial", "sans-serif"];
  function fontStack(family) {
    const fam = (family ?? "").trim().replace(/["']/g, "");
    return [...fam ? [`"${fam}"`] : [], ...FALLBACKS].join(", ");
  }
  function canvasFont(s) {
    return `${s.italic ? "italic " : ""}${s.bold ? "bold " : ""}${s.fontSizePx}px ${fontStack(s.fontFamily)}`;
  }
  var WEBFONT_ALIASES = {
    montserrat: "Montserrat",
    vidaloka: "Vidaloka",
    "playfair display": "Playfair+Display",
    lato: "Lato",
    roboto: "Roboto",
    "open sans": "Open+Sans",
    poppins: "Poppins",
    nunito: "Nunito",
    raleway: "Raleway",
    "source sans pro": "Source+Sans+3",
    merriweather: "Merriweather",
    "dm sans": "DM+Sans",
    "work sans": "Work+Sans",
    inter: "Inter"
  };
  async function ensureDeckFonts(families) {
    if (typeof document === "undefined") return 0;
    const wanted = /* @__PURE__ */ new Set();
    for (const f of families) {
      const g = WEBFONT_ALIASES[(f ?? "").trim().toLowerCase()];
      if (g) wanted.add(g);
    }
    if (!wanted.size) return 0;
    const href = "https://fonts.googleapis.com/css2?" + [...wanted].map((f) => `family=${f}:ital,wght@0,400;0,700;1,400`).join("&") + "&display=block";
    await new Promise((resolve) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      const done = () => resolve();
      link.onload = done;
      link.onerror = done;
      document.head.appendChild(link);
      setTimeout(done, 6e3);
    });
    try {
      await document.fonts.ready;
      const probe = document.createElement("span");
      probe.style.cssText = "position:absolute;visibility:hidden;font-size:48px";
      probe.textContent = "Ag";
      document.body.appendChild(probe);
      for (const g of wanted) {
        for (const spec of ["400", "700", "italic 400"]) {
          const family = g.replace(/\+/g, " ");
          probe.style.fontFamily = `"${family}"`;
          probe.style.fontWeight = spec.includes("700") ? "700" : "400";
          probe.style.fontStyle = spec.includes("italic") ? "italic" : "normal";
          try {
            await document.fonts.load(`${spec} 48px "${family}"`, "Ag");
          } catch {
          }
        }
      }
      probe.remove();
      await document.fonts.ready;
    } catch {
    }
    return wanted.size;
  }
  function fontAvailability(families) {
    const out = {};
    if (typeof document === "undefined") return out;
    for (const f of families) {
      out[f] = document.fonts.check(`48px "${f}"`);
    }
    return out;
  }

  // src/svg.ts
  var uid2 = 0;
  var nid = () => `g${++uid2}`;
  var esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  function fillOut(fill, box) {
    if (!fill || fill.kind === "none") return { attrs: 'fill="none"', defs: "" };
    if (fill.kind === "solid") return { attrs: `fill="${fill.color}"`, defs: "" };
    if (fill.kind === "gradient") {
      const id = nid();
      const a = fill.angleDeg * Math.PI / 180;
      const x1 = (0.5 - Math.cos(a) / 2).toFixed(4);
      const y1 = (0.5 - Math.sin(a) / 2).toFixed(4);
      const x2 = (0.5 + Math.cos(a) / 2).toFixed(4);
      const y2 = (0.5 + Math.sin(a) / 2).toFixed(4);
      const stops = fill.stops.map((s) => `<stop offset="${(s.pos * 100).toFixed(1)}%" stop-color="${s.color}"/>`).join("");
      const def = fill.radial ? (() => {
        const cx = (fill.center?.x ?? 0.5).toFixed(3);
        const cy = (fill.center?.y ?? 0.5).toFixed(3);
        return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="0.75">${stops}</radialGradient>`;
      })() : `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops}</linearGradient>`;
      return { attrs: `fill="url(#${id})"`, defs: def };
    }
    if (fill.kind === "image" && fill.dataUrl) {
      const id = nid();
      const l = fill.fillRect?.l ?? 0;
      const t = fill.fillRect?.t ?? 0;
      const r = fill.fillRect?.r ?? 0;
      const b = fill.fillRect?.b ?? 0;
      const def = `<clipPath id="${id}"><rect x="${box.x + box.w * l}" y="${box.y + box.h * t}" width="${box.w * (1 - l - r)}" height="${box.h * (1 - t - b)}"/></clipPath>`;
      const alpha = fill.alpha != null ? ` opacity="${fill.alpha}"` : "";
      const img = `<image clip-path="url(#${id})" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" preserveAspectRatio="none" href="${fill.dataUrl}"${alpha}/>`;
      return { attrs: 'fill="none"', defs: def, imageEl: img };
    }
    if (fill.kind === "pattern") return { attrs: `fill="${fill.bg}"`, defs: "" };
    return { attrs: 'fill="none"', defs: "" };
  }
  function strokeAttrs(s) {
    let out = `stroke="${s.color}" stroke-width="${Math.max(s.widthPx, 0.4)}"`;
    if (s.dash?.length) out += ` stroke-dasharray="${s.dash.join(" ")}"`;
    if (s.cap) out += ` stroke-linecap="${s.cap}"`;
    if (s.join && s.join !== "bevel") out += ` stroke-linejoin="${s.join}"`;
    return out;
  }
  function pivotWrap(box, inner) {
    const t = [];
    if (box.rotationDeg) t.push(`rotate(${box.rotationDeg.toFixed(2)} ${box.centerX.toFixed(2)} ${box.centerY.toFixed(2)})`);
    if (box.flipH || box.flipV) {
      const sx = box.flipH ? -1 : 1;
      const sy = box.flipV ? -1 : 1;
      t.push(
        `translate(${box.centerX.toFixed(2)} ${box.centerY.toFixed(2)}) scale(${sx} ${sy}) translate(${(-box.centerX).toFixed(2)} ${(-box.centerY).toFixed(2)})`
      );
    }
    return t.length ? `<g transform="${t.join(" ")}">${inner}</g>` : inner;
  }
  function shadowStyle(sh) {
    if (!sh || sh.inner) return "";
    return ` style="filter:drop-shadow(${sh.offsetX}px ${sh.offsetY}px ${sh.blurPx}px ${sh.color})"`;
  }
  function glyphRunEl(run, line2) {
    const x = run.x.toFixed(2);
    const y = run.baselineY.toFixed(2);
    const parts = [];
    if (run.highlight) {
      parts.push(
        `<rect x="${x}" y="${line2.top.toFixed(2)}" width="${run.widthPx.toFixed(2)}" height="${line2.height.toFixed(2)}" fill="${run.highlight}"/>`
      );
    }
    let fill = run.color;
    if (run.gradient) {
      const id = nid();
      const a = run.gradient.angleDeg * Math.PI / 180;
      parts.push(
        `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x}" y1="${y}" x2="${(run.x + Math.cos(a) * run.widthPx).toFixed(2)}" y2="${(y + Math.sin(a) * run.widthPx).toFixed(2)}">` + run.gradient.stops.map((s) => `<stop offset="${(s.pos * 100).toFixed(1)}%" stop-color="${s.color}"/>`).join("") + `</linearGradient>`
      );
      fill = `url(#${id})`;
    }
    let style = "";
    if (run.shadow) style += `filter:drop-shadow(${run.shadow.offsetX}px ${run.shadow.offsetY}px ${run.shadow.blurPx}px ${run.shadow.color});`;
    if (run.outline) {
      style += "paint-order:stroke;";
    }
    let attrs = ` x="${x}" y="${y}" font-family="${esc(fontStack(run.fontFamily))}" font-size="${run.fontSizePx.toFixed(2)}" fill="${fill}"` + (run.bold ? ' font-weight="bold"' : "") + (run.italic ? ' font-style="italic"' : "") + (run.letterSpacingPx ? ` letter-spacing="${run.letterSpacingPx.toFixed(2)}"` : "") + (run.rtl ? ' direction="rtl"' : "") + (style ? ` style="${style}"` : "");
    if (run.outline) {
      attrs += ` stroke="${run.outline.color}" stroke-width="${run.outline.widthPx.toFixed(2)}"`;
    }
    if (run.strike || run.underline) {
      const uy = run.underline ? run.baselineY + run.fontSizePx * 0.12 : run.baselineY - run.fontSizePx * 0.28;
      parts.push(
        `<line x1="${x}" y1="${uy.toFixed(2)}" x2="${(run.x + run.widthPx).toFixed(2)}" y2="${uy.toFixed(2)}" stroke="${run.color}" stroke-width="${Math.max(run.fontSizePx * 0.06, 0.6)}"/>`
      );
    }
    const rot = run.rotate90 ? 90 : run.rotate270 ? -90 : 0;
    const text = `<text xml:space="preserve"${attrs}${rot ? ` transform="rotate(${rot} ${x} ${y})"` : ""}>${esc(run.text)}</text>`;
    parts.push(text);
    return parts.join("");
  }
  function textEl(t, box) {
    const lines = t.lines.map(
      (ln) => ln.runs.map((r) => glyphRunEl(r, { top: ln.top, height: ln.height })).join("")
    ).join("");
    return `<g transform="translate(${box.x.toFixed(2)} ${box.y.toFixed(2)})">${lines}</g>`;
  }
  function shapeNodeEl(n) {
    const defs = [];
    const fo = fillOut(n.fill, n.box);
    defs.push(fo.defs);
    let geom;
    if (n.line) {
      const pts = n.line.points;
      let d = `M ${pts[0]} ${pts[1]}`;
      if (n.line.bezier?.length) {
        const bz = n.line.bezier;
        for (let i = 0; i + 5 < bz.length; i += 6) {
          d += ` C ${bz[i]} ${bz[i + 1]} ${bz[i + 2]} ${bz[i + 3]} ${bz[i + 4]} ${bz[i + 5]}`;
        }
      } else {
        for (let i = 2; i < pts.length; i += 2) d += ` L ${pts[i]} ${pts[i + 1]}`;
      }
      const s = n.stroke;
      geom = `<path d="${d}" fill="none" ${s ? strokeAttrs(s) : 'stroke="#404040" stroke-width="1"'} stroke-linecap="round" stroke-linejoin="round"/>`;
      const arrowAt = (end, atStart) => {
        if (!end) return "";
        const n2 = pts.length;
        const [ax, ay] = atStart ? [pts[0], pts[1]] : [pts[n2 - 2], pts[n2 - 1]];
        const [bx, by] = atStart ? n2 >= 4 ? [pts[2], pts[3]] : [ax + 1, ay] : n2 >= 4 ? [pts[n2 - 4], pts[n2 - 3]] : [ax - 1, ay];
        const ang = Math.atan2(ay - by, ax - bx);
        const p = (dx, dy) => `${(ax + dx * Math.cos(ang) - dy * Math.sin(ang)).toFixed(2)},${(ay + dx * Math.sin(ang) + dy * Math.cos(ang)).toFixed(2)}`;
        return `<polygon points="${p(end.lengthPx, 0)} ${p(0, end.widthPx / 2)} ${p(0, -end.widthPx / 2)}" fill="${s?.color ?? "#404040"}"/>`;
      };
      geom += arrowAt(n.line.headEnd, true) + arrowAt(n.line.tailEnd, false);
    } else if (n.pathData || n.fillPathData || n.strokePathData) {
      let g = "";
      if (n.fillPathData && n.pathData) g += `<path d="${n.fillPathData}" fill="none"/>`;
      const main2 = n.pathData ?? n.fillPathData ?? "";
      if (main2) g += `<path d="${main2}" ${fo.attrs} ${n.stroke ? strokeAttrs(n.stroke) : ""}/>`;
      if (n.strokePathData)
        g += `<path d="${n.strokePathData}" fill="none" ${n.stroke ? strokeAttrs(n.stroke) : `stroke="#404040" stroke-width="1"`}/>`;
      geom = g;
    } else if (n.polygonPoints?.length) {
      const pts = [];
      for (let i = 0; i < n.polygonPoints.length; i += 2) pts.push(`${n.polygonPoints[i]},${n.polygonPoints[i + 1]}`);
      geom = `<polygon points="${pts.join(" ")}" ${fo.attrs} ${n.stroke ? strokeAttrs(n.stroke) : ""}/>`;
    } else if (n.cornerRadiusPx != null) {
      geom = `<rect x="0" y="0" width="${n.box.w.toFixed(2)}" height="${n.box.h.toFixed(2)}" rx="${Math.min(n.cornerRadiusPx, n.box.w / 2, n.box.h / 2).toFixed(2)}" ${fo.attrs} ${n.stroke ? strokeAttrs(n.stroke) : ""}/>`;
    } else if (n.presetGeometry === "ellipse") {
      geom = `<ellipse cx="${(n.box.w / 2).toFixed(2)}" cy="${(n.box.h / 2).toFixed(2)}" rx="${(n.box.w / 2).toFixed(2)}" ry="${(n.box.h / 2).toFixed(2)}" ${fo.attrs} ${n.stroke ? strokeAttrs(n.stroke) : ""}/>`;
    } else {
      geom = `<rect x="0" y="0" width="${n.box.w.toFixed(2)}" height="${n.box.h.toFixed(2)}" ${fo.attrs} ${n.stroke ? strokeAttrs(n.stroke) : ""}/>`;
    }
    const t = n.text;
    let inner = `<g transform="translate(${n.box.x.toFixed(2)} ${n.box.y.toFixed(2)})">${geom}</g>` + (t ? textEl(t, { x: n.box.x + t.insets.l, y: n.box.y + t.insets.t }) : "");
    if (fo.imageEl) inner = fo.imageEl + inner;
    const el = pivotWrap(n.box, inner);
    return `<g${shadowStyle(n.shadow)}>${el}</g>`;
  }
  function pictureNodeEl(n) {
    const defs = [];
    let inner = "";
    if (n.bgColor) {
      inner += `<rect x="0" y="0" width="${n.box.w.toFixed(2)}" height="${n.box.h.toFixed(2)}" fill="${n.bgColor}"/>`;
    }
    if (n.fill && n.fill.kind !== "none") {
      const fo = fillOut(n.fill, n.box);
      defs.push(fo.defs);
      inner += `<rect x="0" y="0" width="${n.box.w.toFixed(2)}" height="${n.box.h.toFixed(2)}" ${fo.attrs}/>`;
    }
    if (n.dataUrl) {
      const sr = n.srcRect;
      const vb = sr ? ` viewBox="${sr.l} ${sr.t} ${1 - sr.l - sr.r} ${1 - sr.t - sr.b}" preserveAspectRatio="none"` : "";
      const clipId = nid();
      let clipAttr = "";
      if (n.clip) {
        let shape = "";
        if (n.clip.pathData) shape = `<path d="${n.clip.pathData}"/>`;
        else if (n.clip.polygonPoints?.length) {
          const pts = [];
          for (let i = 0; i < n.clip.polygonPoints.length; i += 2) pts.push(`${n.clip.polygonPoints[i]},${n.clip.polygonPoints[i + 1]}`);
          shape = `<polygon points="${pts.join(" ")}"/>`;
        } else if (n.clip.cornerRadiusPx != null)
          shape = `<rect x="0" y="0" width="${n.box.w.toFixed(2)}" height="${n.box.h.toFixed(2)}" rx="${n.clip.cornerRadiusPx.toFixed(2)}"/>`;
        if (shape) {
          defs.push(`<clipPath id="${clipId}">${shape}</clipPath>`);
          clipAttr = ` clip-path="url(#${clipId})"`;
        }
      }
      const style = n.softEdgePx ? ` style="filter:blur(${(n.softEdgePx / 2).toFixed(1)}px)"` : "";
      inner += `<g${clipAttr}${style}><svg x="0" y="0" width="${n.box.w.toFixed(2)}" height="${n.box.h.toFixed(2)}"${vb}><image x="0" y="0" width="1" height="1" preserveAspectRatio="none" href="${n.dataUrl}"/></svg></g>`;
    }
    if (n.stroke) {
      inner += `<rect x="0" y="0" width="${n.box.w.toFixed(2)}" height="${n.box.h.toFixed(2)}" fill="none" ${strokeAttrs(n.stroke)}/>`;
    }
    const op = n.opacity != null && n.opacity < 1 ? ` opacity="${n.opacity}"` : "";
    const placed = `<g transform="translate(${n.box.x.toFixed(2)} ${n.box.y.toFixed(2)})">${inner}</g>`;
    return `<g${op}>${pivotWrap(n.box, placed)}</g>`;
  }
  function groupNodeEl(n) {
    const kids = n.children.map(nodeEl).join("");
    const inner = `<g transform="translate(${n.box.x.toFixed(2)} ${n.box.y.toFixed(2)})">${kids}</g>`;
    return pivotWrap(n.box, inner);
  }
  function tableNodeEl(n) {
    const defs = [];
    let inner = "";
    if (n.bgFill && n.bgFill.kind !== "none") {
      const fo = fillOut(n.bgFill, n.box);
      defs.push(fo.defs);
      inner += `<rect x="0" y="0" width="${n.box.w.toFixed(2)}" height="${n.box.h.toFixed(2)}" ${fo.attrs}/>`;
    }
    for (const c of n.cells) {
      const fo = fillOut(c.fill, c);
      defs.push(fo.defs);
      inner += `<rect x="${c.x.toFixed(2)}" y="${c.y.toFixed(2)}" width="${c.w.toFixed(2)}" height="${c.h.toFixed(2)}" ${fo.attrs}/>`;
      for (const side of ["l", "r", "t", "b"]) {
        const b = c.borders?.[side];
        if (!b) continue;
        const d = side === "l" ? `M ${c.x} ${c.y} L ${c.x} ${c.y + c.h}` : side === "r" ? `M ${c.x + c.w} ${c.y} L ${c.x + c.w} ${c.y + c.h}` : side === "t" ? `M ${c.x} ${c.y} L ${c.x + c.w} ${c.y}` : `M ${c.x} ${c.y + c.h} L ${c.x + c.w} ${c.y + c.h}`;
        inner += `<path d="${d}" fill="none" ${strokeAttrs(b)}/>`;
      }
      if (c.text) inner += textEl(c.text, { x: c.x, y: c.y });
    }
    return `<g transform="translate(${n.box.x.toFixed(2)} ${n.box.y.toFixed(2)})">${inner}</g>`;
  }
  function chartNodeEl(n) {
    const defs = [];
    let inner = "";
    if (n.bgFill && n.bgFill.kind !== "none") {
      const fo = fillOut(n.bgFill, n.box);
      defs.push(fo.defs);
      inner += `<rect x="0" y="0" width="${n.box.w.toFixed(2)}" height="${n.box.h.toFixed(2)}" ${fo.attrs}/>`;
    }
    if (n.plotRect) {
      const pr = n.plotRect;
      const fo = fillOut(pr.fill, pr);
      defs.push(fo.defs);
      inner += `<rect x="${pr.x}" y="${pr.y}" width="${pr.w}" height="${pr.h}" ${fo.attrs}${pr.borderColor ? ` stroke="${pr.borderColor}" stroke-width="${pr.borderWidthPx ?? 1}"` : ""}/>`;
    }
    for (const g of [...n.gridLines, ...n.axisLines]) {
      inner += `<line x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" stroke="${g.color}" stroke-width="${g.widthPx ?? 0.6}"/>`;
    }
    for (const b of n.bars) inner += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${b.color}"/>`;
    for (const w of n.wedges ?? []) {
      const a0 = (w.startDeg - 90) * Math.PI / 180;
      const a1 = (w.startDeg + w.sweepDeg - 90) * Math.PI / 180;
      const large = w.sweepDeg > 180 ? 1 : 0;
      const x0 = w.cx + w.outerR * Math.cos(a0);
      const y0 = w.cy + w.outerR * Math.sin(a0);
      const x1 = w.cx + w.outerR * Math.cos(a1);
      const y1 = w.cy + w.outerR * Math.sin(a1);
      let d;
      if (w.innerR > 0) {
        const ix1 = w.cx + w.innerR * Math.cos(a1);
        const iy1 = w.cy + w.innerR * Math.sin(a1);
        const ix0 = w.cx + w.innerR * Math.cos(a0);
        const iy0 = w.cy + w.innerR * Math.sin(a0);
        d = `M ${x0} ${y0} A ${w.outerR} ${w.outerR} 0 ${large} 1 ${x1} ${y1} L ${ix1} ${iy1} A ${w.innerR} ${w.innerR} 0 ${large} 0 ${ix0} ${iy0} Z`;
      } else {
        d = `M ${w.cx} ${w.cy} L ${x0} ${y0} A ${w.outerR} ${w.outerR} 0 ${large} 1 ${x1} ${y1} Z`;
      }
      inner += `<path d="${d}" fill="${w.noFill ? "none" : w.color}" stroke="${w.stroke ?? "#fff"}" stroke-width="${w.strokeWidthPx ?? 0.5}"/>`;
    }
    for (const p of n.polylines) {
      const pts = [];
      for (let i = 0; i < p.points.length; i += 2) pts.push(`${p.points[i]},${p.points[i + 1]}`);
      inner += `<polyline points="${pts.join(" ")}" fill="${p.fill ?? "none"}" stroke="${p.color}" stroke-width="${p.widthPx}"/>`;
    }
    for (const p of n.paths ?? []) inner += `<path d="${p.d}" fill="${p.fill}"${p.stroke ? ` stroke="${p.stroke}" stroke-width="${p.strokeWidthPx ?? 1}"` : ""}/>`;
    for (const m of n.markers) inner += `<circle cx="${m.x}" cy="${m.y}" r="${m.r}" fill="${m.color}"/>`;
    for (const s of n.swatches) inner += `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${s.color}"/>`;
    for (const l of n.labels) {
      inner += `<text x="${l.x}" y="${l.y + l.fontSizePx}" font-size="${l.fontSizePx}" fill="${l.color}"${l.bold ? ' font-weight="bold"' : ""}${l.fontFamily ? ` font-family="${esc(fontStack(l.fontFamily))}"` : ""}${l.rotationDeg ? ` transform="rotate(${l.rotationDeg} ${l.x} ${l.y})"` : ""}>${esc(l.text)}</text>`;
    }
    return `<g transform="translate(${n.box.x.toFixed(2)} ${n.box.y.toFixed(2)})">${inner}</g>`;
  }
  function nodeEl(n) {
    switch (n.type) {
      case "shape":
      case "text":
        return shapeNodeEl(n);
      case "picture":
        return pictureNodeEl(n);
      case "group":
        return groupNodeEl(n);
      case "table":
        return tableNodeEl(n);
      case "chart":
        return chartNodeEl(n);
      case "placeholder-chip": {
        const { x, y, w, h } = n.box;
        return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#8a8a8a" stroke-dasharray="4 3"/><text x="${x + 8}" y="${y + 20}" font-size="12" fill="#8a8a8a">[${esc(n.label)}]</text></g>`;
      }
    }
  }
  function renderSlideSvg(s) {
    uid2 = 0;
    const defs = [];
    let body = "";
    const bf = fillOut(s.background, { x: 0, y: 0, w: s.widthPx, h: s.heightPx });
    defs.push(bf.defs);
    if (s.background.kind !== "none") {
      body += `<rect x="0" y="0" width="${s.widthPx}" height="${s.heightPx}" ${bf.attrs}/>`;
    }
    if (bf.imageEl) body += bf.imageEl;
    for (const n of s.nodes) body += nodeEl(n);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s.widthPx}" height="${s.heightPx}" viewBox="0 0 ${s.widthPx} ${s.heightPx}">` + (defs.some((d) => d) ? `<defs>${defs.join("")}</defs>` : "") + body + `</svg>`;
  }

  // src/canvas-metrics.ts
  function makeCtx() {
    try {
      if (typeof OffscreenCanvas !== "undefined") {
        return new OffscreenCanvas(8, 8).getContext("2d");
      }
      if (typeof document !== "undefined") {
        return document.createElement("canvas").getContext("2d");
      }
    } catch {
    }
    return null;
  }
  var CanvasMetrics = class {
    ctx = makeCtx();
    cache = /* @__PURE__ */ new Map();
    metrics(style) {
      const key = `${style.fontFamily}|${style.fontSizePx}|${style.bold}|${style.italic}`;
      const hit = this.cache.get(key);
      if (hit) return hit;
      let m;
      const c = this.ctx;
      if (c?.measureText) {
        c.font = this.fontStr(style);
        const x = c.measureText("Mg");
        const asc = x.fontBoundingBoxAscent ?? style.fontSizePx * 0.8;
        const desc = x.fontBoundingBoxDescent ?? style.fontSizePx * 0.22;
        m = { ascent: asc, descent: desc, lineHeight: asc + desc };
      } else {
        m = {
          ascent: style.fontSizePx * 0.8,
          descent: style.fontSizePx * 0.22,
          lineHeight: style.fontSizePx * 1.02
        };
      }
      this.cache.set(key, m);
      return m;
    }
    measure(text, style) {
      const c = this.ctx;
      if (!c?.measureText) return text.length * style.fontSizePx * 0.55;
      c.font = this.fontStr(style);
      return c.measureText(text).width;
    }
    fontStr(style) {
      return canvasFont(style);
    }
  };

  // src/browser-test.ts
  var T0 = performance.now();
  var Q = new URLSearchParams(location.search);
  var SRC = Q.get("src") ?? "./sample.pptx";
  var FIT_W = Number(Q.get("w") ?? 960);
  var ONLY = Q.get("only") ? Number(Q.get("only")) : 0;
  function collectFamilies(deck) {
    const fams = /* @__PURE__ */ new Set();
    const probe = new CanvasMetrics();
    for (const slide of deck.slides) {
      let rs;
      try {
        rs = buildRenderSlide(slide, deck.size, { fitWidthPx: FIT_W, metrics: probe });
      } catch {
        continue;
      }
      const walk = (nodes) => {
        for (const n of nodes) {
          for (const ln of n.text?.lines ?? []) for (const r of ln.runs) if (r.fontFamily) fams.add(r.fontFamily);
          if (n.type === "group") walk(n.children ?? []);
        }
      };
      walk(rs.nodes);
    }
    return fams;
  }
  var round = (v) => Number(v.toFixed(2));
  var log = (msg) => {
    const el = document.getElementById("log");
    if (el) el.textContent += msg + "\n";
    console.log(msg);
  };
  async function main() {
    const res = await fetch(SRC);
    if (!res.ok) throw new Error(`fetch ${SRC} \u2192 ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    log(`loaded ${SRC} (${(bytes.length / 1048576).toFixed(1)} MB)`);
    const opened = await openPptx(bytes);
    log(`parsed slides=${opened.deck.slides.length} size=${JSON.stringify(opened.deck.size)} in ${(performance.now() - T0).toFixed(0)}ms`);
    const families = collectFamilies(opened.deck);
    log(`font families in deck: ${[...families].join(" | ") || "(none)"}`);
    const loaded = await ensureDeckFonts(families);
    log(`webfonts requested: ${loaded} \xB7 available: ${JSON.stringify(fontAvailability(families))}`);
    {
      const c = document.createElement("canvas").getContext("2d");
      const probeStyle = '48px "Montserrat", "Helvetica Neue", Arial, sans-serif';
      c.font = probeStyle;
      const a = c.measureText("presentation").width;
      c.font = "48px sans-serif";
      const b = c.measureText("presentation").width;
      log(`measure check: montserrat-stack=${a.toFixed(2)} sans-serif=${b.toFixed(2)} ${Math.abs(a - b) < 0.5 ? "(faces MISSING - fallback in use)" : "(distinct face loaded)"}`);
    }
    const { resolve, missing } = createMediaResolver(opened);
    const metrics = new CanvasMetrics();
    const app = document.getElementById("app");
    const svgs = [];
    const t1 = performance.now();
    opened.deck.slides.filter((_, i) => !ONLY || i + 1 === ONLY).forEach((slide, i) => {
      const rs = buildRenderSlide(slide, opened.deck.size, { fitWidthPx: FIT_W, media: resolve, slideNo: i + 1, metrics });
      const svg = renderSlideSvg(rs);
      svgs.push(svg);
      const deco = rs.nodes.filter((n) => n.decoration).length;
      const el = document.createElement("div");
      el.className = "slide";
      el.innerHTML = `<div class="tag">slide ${i + 1} \xB7 nodes=${rs.nodes.length} \xB7 deco=${deco}</div><div class="canvas">${svg}</div>`;
      app.appendChild(el);
    });
    log(`rendered ${svgs.length} slides in ${(performance.now() - t1).toFixed(0)}ms \xB7 missing media: ${[...missing].join(",") || "none"}`);
    window.__pptxSpike = {
      families: [...families],
      svgs,
      slideCount: svgs.length,
      missing: [...missing],
      ms: +(performance.now() - T0).toFixed(0)
    };
    if (Q.get("runs")) {
      const dump = [];
      opened.deck.slides.forEach((slide, i) => {
        if (ONLY && i + 1 !== ONLY) return;
        const rs = buildRenderSlide(slide, opened.deck.size, { fitWidthPx: FIT_W, media: resolve, slideNo: i + 1, metrics });
        const walk = (nodes) => {
          for (const n of nodes) {
            dump.push({ kind: n.type, deco: !!n.decoration, box: [round(n.box.x), round(n.box.y), round(n.box.w), round(n.box.h)] });
            dump.push({ kind: n.type, deco: !!n.decoration, box: [round(n.box.x), round(n.box.y), round(n.box.w), round(n.box.h)] });
            if (n.text) {
              for (const ln of n.text.lines) {
                dump.push({
                  slide: i + 1,
                  box: [round(n.box.x), round(n.box.y), round(n.box.w), round(n.box.h)],
                  insets: n.text.insets,
                  top: round(ln.top),
                  runs: ln.runs.map((r) => ({ x: round(r.x), w: round(r.widthPx), fam: r.fontFamily, sz: round(r.fontSizePx), t: r.text }))
                });
              }
            }
            if (n.type === "group") walk(n.children ?? []);
          }
        };
        walk(rs.nodes);
      });
      const pre = document.createElement("pre");
      pre.id = "runs";
      pre.textContent = JSON.stringify(dump.map((d) => ({ ...d, runs: (d.runs ?? []).map((r) => `${r.x}|${r.w}|${r.fam}|${r.sz}|${JSON.stringify(r.t)}`) })), null, 1);
      document.body.appendChild(pre);
    }
    if (Q.get("runs")) {
      const dump = [];
      opened.deck.slides.forEach((slide, i) => {
        if (ONLY && i + 1 !== ONLY) return;
        const rs = buildRenderSlide(slide, opened.deck.size, { fitWidthPx: FIT_W, media: resolve, slideNo: i + 1, metrics });
        const walk = (nodes) => {
          for (const n of nodes) {
            if (n.text) {
              for (const ln of n.text.lines) {
                dump.push({
                  slide: i + 1,
                  box: [round(n.box.x), round(n.box.y), round(n.box.w), round(n.box.h)],
                  insets: n.text.insets,
                  top: round(ln.top),
                  runs: ln.runs.map((r) => ({ x: round(r.x), w: round(r.widthPx), fam: r.fontFamily, sz: round(r.fontSizePx), t: r.text }))
                });
              }
            }
            if (n.type === "group") walk(n.children ?? []);
          }
        };
        walk(rs.nodes);
      });
      const pre = document.createElement("pre");
      pre.id = "runs";
      pre.textContent = JSON.stringify(dump.map((d) => ({ ...d, runs: (d.runs ?? []).map((r) => `${r.x}|${r.w}|${r.fam}|${r.sz}|${JSON.stringify(r.t)}`) })), null, 1);
      document.body.appendChild(pre);
    }
    document.title = `spike-ready:${svgs.length}`;
  }
  main().catch((err) => {
    log(`ERROR ${err?.stack ?? err}`);
    document.title = "spike-error";
  });
})();
/*! Bundled license information:

jszip/dist/jszip.min.js:
  (*!
  
  JSZip v3.10.2 - A JavaScript class for generating and reading zip files
  <http://stuartk.com/jszip>
  
  (c) 2009-2016 Stuart Knightley <stuart [at] stuartk.com>
  Dual licenced under the MIT license or GPLv3. See https://raw.github.com/Stuk/jszip/main/LICENSE.markdown.
  
  JSZip uses the library pako released under the MIT license :
  https://github.com/nodeca/pako/blob/main/LICENSE
  *)
*/
