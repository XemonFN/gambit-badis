/* Coach Calcinable — logique d'analyse (sans interface).
   Fonctionne dans le navigateur (window.Core) et sous Node (module.exports). */
(function (root) {
  'use strict';
  var ChessCtor = (typeof Chess !== 'undefined') ? Chess : (typeof require !== 'undefined' ? require('./vendor/chess.js').Chess : null);

  var VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  var NAME = { p: 'pion', n: 'cavalier', b: 'fou', r: 'tour', q: 'dame', k: 'roi' };
  var NAME_DET = { p: 'ton pion', n: 'ton cavalier', b: 'ton fou', r: 'ta tour', q: 'ta dame', k: 'ton roi' };
  var NAME_OPP = { p: 'le pion', n: 'le cavalier', b: 'le fou', r: 'la tour', q: 'la dame', k: 'le roi' };
  var FR_PIECE = { K: 'R', Q: 'D', R: 'T', B: 'F', N: 'C' };

  // ---------- Notation française ----------
  function sanFr(san) {
    if (!san) return '';
    return san.replace(/[KQRBN]/g, function (c) { return FR_PIECE[c]; });
  }

  // ---------- Lecture PGN ----------
  function parseClock(s) {
    var p = s.split(':').map(parseFloat);
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    if (p.length === 2) return p[0] * 60 + p[1];
    return p[0];
  }

  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }

  function openingFromUrl(url) {
    if (!url) return '';
    var m = url.match(/openings\/([^?#]+)/);
    if (!m) return '';
    var s = decodeURIComponent(m[1]);
    s = s.replace(/\.{3}.*$/, '').replace(/-\d+\..*$/, '').replace(/-with-.*$/, '');
    return s.replace(/-/g, ' ').trim();
  }

  // nombre de demi-coups « théoriques » d'après l'URL d'ouverture de chess.com
  // ex. .../Caro-Kann-Defense-2.Nc3-d5 → 4 ; .../Scandinavian-3...dxe4 → 6
  function bookFromUrl(url, sans) {
    if (!url) return 0;
    var m = url.match(/openings\/([^?#]+)/); if (!m) return 0;
    var parts = decodeURIComponent(m[1]).replace(/O-O-O/g, 'O_O_O').replace(/O-O/g, 'O_O').split('-');
    var ply = -1, re = /^(\d+)\.(\.\.)?(.+)$/, san = /^([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?|O_O(_O)?)[+#]?$/;
    for (var i = 0; i < parts.length; i++) {
      var x = re.exec(parts[i]);
      if (x && san.test(x[3])) { ply = (parseInt(x[1], 10) - 1) * 2 + (x[2] ? 1 : 0); }
      else if (ply >= 0 && san.test(parts[i])) ply++;
      else if (ply >= 0) break;
    }
    var n = ply < 0 ? 2 : ply + 1;
    return sans && sans.length ? Math.min(n, sans.length) : n;
  }

  function splitPgns(text) {
    text = (text || '').replace(/\r/g, '').trim();
    if (!text) return [];
    var parts = text.split(/\n\s*\n(?=\[Event )/);
    return parts.map(function (p) { return p.trim(); }).filter(function (p) { return p.length > 10; });
  }

  function parseGame(pgn) {
    var c = new ChessCtor();
    var clean = pgn.replace(/\r/g, '');
    var ok = c.load_pgn(clean, { sloppy: true });
    if (!ok) {
      // essai sans commentaires
      var noComm = clean.replace(/\{[^}]*\}/g, ' ').replace(/\$\d+/g, ' ');
      ok = c.load_pgn(noComm, { sloppy: true });
      if (!ok) return null;
    }
    var h = c.header();
    var hist = c.history({ verbose: true });
    var rules = (h.Variant || '').toLowerCase();
    if (rules && rules.indexOf('960') >= 0) return null;
    if (h.SetUp === '1' && h.FEN) return null; // positions de départ non standard
    var g = new ChessCtor();
    var fens = [g.fen()];
    var uci = [];
    var sans = [];
    var movesV = [];
    for (var i = 0; i < hist.length; i++) {
      var mv = g.move({ from: hist[i].from, to: hist[i].to, promotion: hist[i].promotion });
      if (!mv) break;
      fens.push(g.fen());
      uci.push(mv.from + mv.to + (mv.promotion || ''));
      sans.push(mv.san);
      movesV.push({ from: mv.from, to: mv.to, piece: mv.piece, color: mv.color, captured: mv.captured || null, flags: mv.flags, san: mv.san, promotion: mv.promotion || null });
    }
    // horloges
    var movetext = clean.replace(/^\[.*\]\s*$/mg, '');
    var clocks = [];
    var re = /\[%clk\s+([0-9:.]+)\]/g, m;
    while ((m = re.exec(movetext))) clocks.push(parseClock(m[1]));
    if (clocks.length !== uci.length) clocks = clocks.length >= uci.length ? clocks.slice(0, uci.length) : [];
    var tc = h.TimeControl || '';
    var base = null, inc = 0;
    var tcm = tc.match(/^(\d+)(?:\+(\d+))?$/);
    if (tcm) { base = parseInt(tcm[1], 10); inc = tcm[2] ? parseInt(tcm[2], 10) : 0; }
    var spent = [];
    if (clocks.length) {
      for (var k = 0; k < clocks.length; k++) {
        var prev = k >= 2 ? clocks[k - 2] : (base != null ? base : clocks[k]);
        var t = prev - clocks[k] + (k >= 2 || base != null ? inc : 0);
        spent.push(Math.max(0, Math.round(t * 10) / 10));
      }
    }
    var dateStr = (h.UTCDate || h.Date || '').replace(/\./g, '-');
    var timeStr = h.UTCTime || h.EndTime || h.StartTime || '00:00:00';
    var ts = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      ts = Date.parse(dateStr + 'T' + timeStr.replace(/[^0-9:]/g, '').slice(0, 8) + 'Z');
      if (isNaN(ts)) ts = Date.parse(dateStr + 'T00:00:00Z');
    }
    var link = h.Link || '';
    var id = link ? ('g' + (link.match(/(\d+)\/?$/) || [0, hashStr(link)])[1]) : ('p' + hashStr(clean.replace(/\s+/g, ' ')));
    var opening = openingFromUrl(h.ECOUrl) || h.Opening || '';
    var bookPlies = bookFromUrl(h.ECOUrl, sans);
    var tclass = '';
    if (base != null) {
      var est = base + 40 * inc;
      tclass = est < 180 ? 'bullet' : est < 600 ? 'blitz' : est < 3600 ? 'rapid' : 'classique';
    } else if (/\//.test(tc)) tclass = 'quotidien';
    return {
      id: id,
      headers: h,
      white: h.White || 'Blancs', black: h.Black || 'Noirs',
      whiteElo: parseInt(h.WhiteElo, 10) || null, blackElo: parseInt(h.BlackElo, 10) || null,
      result: h.Result || '*',
      termination: h.Termination || '',
      eco: h.ECO || '', opening: opening, bookPlies: bookPlies,
      ts: ts, timeControl: tc, base: base, inc: inc, tclass: tclass, link: link,
      fens: fens, uci: uci, sans: sans, moves: movesV, clocks: clocks, spent: spent
    };
  }

  function myColor(game, username) {
    var u = (username || '').toLowerCase();
    if (game.white.toLowerCase() === u) return 'w';
    if (game.black.toLowerCase() === u) return 'b';
    return null;
  }

  function myResult(game, me) {
    if (game.result === '1/2-1/2') return 'N';
    if (game.result === '1-0') return me === 'w' ? 'V' : 'D';
    if (game.result === '0-1') return me === 'b' ? 'V' : 'D';
    return '?';
  }

  function endReason(game) {
    var t = (game.termination || '').toLowerCase();
    if (/checkmate|échec et mat|mat/.test(t)) return 'mat';
    if (/time|temps/.test(t)) return /insufficient|matériel/.test(t) ? 'nulle' : 'temps';
    if (/resign|abandon/.test(t)) return /abandoned/.test(t) ? 'abandon' : 'abandon';
    if (/stalemate|pat|repetition|répétition|agreement|insufficient|50|draw|nulle/.test(t)) return 'nulle';
    return 'autre';
  }

  // ---------- Évaluation ----------
  function cpOf(ev) { // ev: {cp, mate} point de vue des Blancs
    if (ev.mate != null && ev.mate !== 0) return ev.mate > 0 ? 10000 - ev.mate * 10 : -10000 - ev.mate * 10;
    if (ev.mate === 0) return ev.cp; // déjà fixé (mat sur l'échiquier)
    return ev.cp;
  }
  function winPct(cp) {
    var c = Math.max(-10000, Math.min(10000, cp));
    return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
  }
  function fmtEval(ev) {
    if (!ev) return '';
    if (ev.mate != null && ev.mate !== 0) return (ev.mate > 0 ? '' : '−') + 'M' + Math.abs(ev.mate);
    if (ev.terminal) return ev.cp > 0 ? '1-0' : ev.cp < 0 ? '0-1' : '½';
    var v = ev.cp / 100;
    return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1);
  }

  // ---------- Géométrie de l'échiquier ----------
  function fenBoard(fen) {
    var rows = fen.split(' ')[0].split('/');
    var b = {};
    for (var r = 0; r < 8; r++) {
      var file = 0;
      for (var i = 0; i < rows[r].length; i++) {
        var ch = rows[r][i];
        if (/\d/.test(ch)) { file += parseInt(ch, 10); continue; }
        var sq = 'abcdefgh'[file] + (8 - r);
        b[sq] = { type: ch.toLowerCase(), color: ch === ch.toUpperCase() ? 'w' : 'b' };
        file++;
      }
    }
    return b;
  }
  function sq2xy(sq) { return [sq.charCodeAt(0) - 97, parseInt(sq[1], 10) - 1]; }
  function xy2sq(x, y) { return (x < 0 || x > 7 || y < 0 || y > 7) ? null : String.fromCharCode(97 + x) + (y + 1); }

  // pièces de `color` qui attaquent la case `sq`
  function attackers(b, sq, color) {
    var res = [];
    var xy = sq2xy(sq), x = xy[0], y = xy[1];
    function at(xx, yy) { var s = xy2sq(xx, yy); return s ? { s: s, p: b[s] } : null; }
    // pions
    var dir = color === 'w' ? -1 : 1;
    [-1, 1].forEach(function (dx) { var c = at(x + dx, y + dir); if (c && c.p && c.p.color === color && c.p.type === 'p') res.push({ sq: c.s, type: 'p' }); });
    // cavaliers
    [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]].forEach(function (d) { var c = at(x + d[0], y + d[1]); if (c && c.p && c.p.color === color && c.p.type === 'n') res.push({ sq: c.s, type: 'n' }); });
    // roi
    for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) { if (!dx && !dy) continue; var c2 = at(x + dx, y + dy); if (c2 && c2.p && c2.p.color === color && c2.p.type === 'k') res.push({ sq: c2.s, type: 'k' }); }
    // glisseurs
    var lines = [[1, 0, 'rq'], [-1, 0, 'rq'], [0, 1, 'rq'], [0, -1, 'rq'], [1, 1, 'bq'], [1, -1, 'bq'], [-1, 1, 'bq'], [-1, -1, 'bq']];
    lines.forEach(function (l) {
      var xx = x + l[0], yy = y + l[1];
      while (true) {
        var s = xy2sq(xx, yy); if (!s) break;
        var p = b[s];
        if (p) { if (p.color === color && l[2].indexOf(p.type) >= 0) res.push({ sq: s, type: p.type }); break; }
        xx += l[0]; yy += l[1];
      }
    });
    return res;
  }

  // pièces de `color` en prise dans la position `fen` (le camp adverse est au trait)
  function hangingPieces(fen, color) {
    var b = fenBoard(fen);
    var opp = color === 'w' ? 'b' : 'w';
    var out = [];
    Object.keys(b).forEach(function (s) {
      var p = b[s];
      if (p.color !== color || p.type === 'k' || p.type === 'p') return;
      var A = attackers(b, s, opp);
      if (!A.length) return;
      var D = attackers(b, s, color);
      var minA = Math.min.apply(null, A.map(function (a) { return a.type === 'k' ? 100 : VAL[a.type]; }));
      if (!D.length || minA < VAL[p.type]) out.push({ sq: s, type: p.type });
    });
    return out;
  }

  // cibles attaquées par la pièce en `sq` (attaque double)
  function forkTargets(fen, sq) {
    var b = fenBoard(fen);
    var me = b[sq]; if (!me) return [];
    var opp = me.color === 'w' ? 'b' : 'w';
    var out = [];
    Object.keys(b).forEach(function (s) {
      var p = b[s];
      if (p.color !== opp || p.type === 'p') return;
      var A = attackers(b, s, me.color).filter(function (a) { return a.sq === sq; });
      if (!A.length) return;
      var defended = attackers(b, s, opp).length > 0;
      if (p.type === 'k' || VAL[p.type] > VAL[me.type] || !defended) out.push({ sq: s, type: p.type });
    });
    return out;
  }

  function materialNonPawn(fen) {
    var b = fenBoard(fen), t = 0;
    Object.keys(b).forEach(function (s) { var p = b[s]; if (p.type !== 'p' && p.type !== 'k') t += VAL[p.type]; });
    return t;
  }

  function phaseOf(fen, ply) {
    if (ply < 20 && materialNonPawn(fen) > 50) return 'ouverture';
    if (materialNonPawn(fen) <= 26) return 'finale';
    return 'milieu';
  }

  function uciInfo(fen, uciMove) {
    if (!uciMove) return null;
    var c = new ChessCtor(fen);
    var mv = c.move({ from: uciMove.slice(0, 2), to: uciMove.slice(2, 4), promotion: uciMove[4] || 'q' });
    if (!mv) return null;
    return { san: mv.san, from: mv.from, to: mv.to, piece: mv.piece, captured: mv.captured || null, fenAfter: c.fen(), check: /\+|#/.test(mv.san), mate: /#/.test(mv.san) };
  }

  function pvSan(fen, pv, n) {
    var c = new ChessCtor(fen), out = [];
    for (var i = 0; i < Math.min(n || 6, pv.length); i++) {
      var u = pv[i];
      var mv = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' });
      if (!mv) break;
      out.push(mv.san);
    }
    return out;
  }

  // ---------- Classement des coups ----------
  var CLASSES = {
    brillant: { label: 'Brillant', sym: '!!', order: 0 },
    unique: { label: 'Très bon coup', sym: '!', order: 1 },
    meilleur: { label: 'Meilleur', sym: '★', order: 2 },
    excellent: { label: 'Excellent', sym: '', order: 3 },
    bon: { label: 'Bon', sym: '', order: 4 },
    theorie: { label: 'Théorique', sym: '', order: 5 },
    force: { label: 'Forcé', sym: '□', order: 5 },
    imprecision: { label: 'Imprécision', sym: '?!', order: 6 },
    erreur: { label: 'Erreur', sym: '?', order: 7 },
    manquee: { label: 'Occasion manquée', sym: '✕', order: 8 },
    gaffe: { label: 'Gaffe', sym: '??', order: 9 }
  };
  var BAD = { imprecision: 1, erreur: 1, manquee: 1, gaffe: 1 };

  function fmtTime(s) {
    if (s == null) return '';
    if (s < 10) return s.toFixed(1).replace('.', ',') + ' s';
    if (s < 60) return Math.round(s) + ' s';
    var m = Math.floor(s / 60), r = Math.round(s % 60);
    return m + ' min ' + (r < 10 ? '0' : '') + r;
  }

  /* evals[i] : évaluation de la position i (avant le coup i), point de vue des Blancs
     { cp, mate, best, pv:[uci], second:{cp,mate,move}|null, legal, terminal } */
  function review(game, evalsIn, me) {
    var n = game.uci.length;
    var out = [];
    // propagation arrière : si le coup joué est celui du moteur, la position suivante
    // (analysée avec un coup d'avance) donne une évaluation plus fiable
    var evals = evalsIn.map(function (e) { return e ? Object.assign({}, e) : e; });
    for (var j = n - 1; j >= 0; j--) {
      var e0 = evals[j], e1 = evals[j + 1];
      if (e0 && e1 && e0.best && e0.best.slice(0, 4) === game.uci[j].slice(0, 4)) { e0.cp = e1.cp; e0.mate = e1.mate; }
    }
    for (var i = 0; i < n; i++) {
      var mover = i % 2 === 0 ? 'w' : 'b';
      var sgn = mover === 'w' ? 1 : -1;
      var evB = evals[i], evA = evals[i + 1];
      if (!evB || !evA) { out.push(null); continue; }
      var wBefore = winPct(sgn * cpOf(evB));
      var wAfter = winPct(sgn * cpOf(evA));
      var played0 = game.uci[i];
      var isBest0 = evB.best && evB.best.slice(0, 4) === played0.slice(0, 4);
      var loss = isBest0 ? 0 : Math.max(0, wBefore - wAfter);
      var acc = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669 + 1));
      var played = game.uci[i];
      var isBest = evB.best && evB.best.slice(0, 4) === played.slice(0, 4);
      var cls;
      if (evB.legal === 1) cls = 'force';
      else if (isBest || loss < 0.5) cls = isBest ? 'meilleur' : 'excellent';
      else if (loss < 2) cls = 'excellent';
      else if (loss < 5) cls = 'bon';
      else if (loss < 10) cls = 'imprecision';
      else if (loss < 20) cls = 'erreur';
      else cls = 'gaffe';
      // déjà gagné et toujours gagné : on ne dramatise pas
      if (BAD[cls] && wBefore > 97 && wAfter > 90) cls = 'bon';
      if (BAD[cls] && wBefore < 3) cls = loss > 22 ? 'imprecision' : 'bon';
      // début de partie : l'évaluation du moteur est encore floue
      // coups de théorie (ouverture reconnue par chess.com)
      if (game.bookPlies && i < game.bookPlies && loss < 10) cls = 'theorie';

      var tags = [];
      var mv = game.moves[i];
      var fenB = game.fens[i], fenA = game.fens[i + 1];

      // coup unique
      if (cls !== 'theorie' && isBest && evB.second && evB.legal > 1) {
        var w2 = winPct(sgn * cpOf(evB.second));
        if (wBefore - w2 > 18 && wBefore < 92 && wBefore > 25) cls = 'unique';
      }
      // brillant : bon coup qui laisse une pièce en prise (sacrifice)
      if (cls !== 'theorie' && (isBest || loss < 2) && mv.piece !== 'p' && mv.piece !== 'k' && wAfter > 45 && wBefore < 95) {
        var hang = hangingPieces(fenA, mover).filter(function (h) { return VAL[h.type] >= 3; });
        var capturedVal = mv.captured ? VAL[mv.captured] : 0;
        var hv = hang.reduce(function (a, h) { return Math.max(a, VAL[h.type]); }, 0);
        if (hang.length && hv > capturedVal + 1 && !/\+/.test(mv.san)) cls = 'brillant';
      }

      var prev = i > 0 ? out[i - 1] : null;
      // occasion manquée : l'adversaire venait de se tromper
      if ((cls === 'erreur' || cls === 'gaffe' || cls === 'imprecision') && prev && (prev.cls === 'gaffe' || prev.cls === 'erreur') && loss >= 10) {
        cls = 'manquee'; tags.push('pas_puni');
      }

      // ---- diagnostic ----
      var bestInfo = uciInfo(fenB, evB.best);
      var comment = '';
      var reasons = [];
      var bestSan = bestInfo ? bestInfo.san : '';
      var mateBefore = evB.mate != null && evB.mate !== 0 ? sgn * evB.mate : null; // >0 : le joueur matait
      var mateAfter = evA.mate != null && evA.mate !== 0 ? sgn * evA.mate : null;   // <0 : le joueur se fait mater

      if (BAD[cls] || cls === 'bon') {
        if (mateBefore && mateBefore > 0 && !(mateAfter && mateAfter > 0)) {
          tags.push('mat_rate');
          reasons.push('Tu avais un mat en ' + mateBefore + ' : ' + sanFr(bestSan) + (evB.pv && evB.pv.length > 1 ? ' (' + pvSan(fenB, evB.pv, Math.min(2 * mateBefore - 1, 7)).map(sanFr).join(' ') + ')' : '') + '.');
        }
        if (mateAfter && mateAfter < 0 && !(mateBefore && mateBefore < 0)) {
          tags.push('mat_concede');
          var replyPv = evA.pv && evA.pv.length ? pvSan(fenA, evA.pv, Math.min(2 * Math.abs(mateAfter) - 1, 7)).map(sanFr).join(' ') : '';
          reasons.push('Ce coup permet à l’adversaire de mater en ' + Math.abs(mateAfter) + (replyPv ? ' : ' + replyPv : '') + '.');
        }
        // pièce laissée en prise (confirmée par le moteur)
        var replyInfo = uciInfo(fenA, evA.best);
        if (replyInfo && replyInfo.captured && VAL[replyInfo.captured] >= 3) {
          var hp = hangingPieces(fenA, mover).filter(function (h) { return h.sq === replyInfo.to; });
          if (hp.length) {
            tags.push(mv.to === replyInfo.to ? 'piece_deplacee_en_prise' : 'piece_laissee_en_prise');
            var who = mv.to === replyInfo.to ? 'La pièce que tu viens de jouer' : (NAME_DET[hp[0].type].charAt(0).toUpperCase() + NAME_DET[hp[0].type].slice(1) + ' en ' + hp[0].sq);
            if (mv.to === replyInfo.to) who = (NAME_DET[hp[0].type].charAt(0).toUpperCase() + NAME_DET[hp[0].type].slice(1)) + ' en ' + hp[0].sq;
            reasons.push(who + ' reste sans protection suffisante : l’adversaire peut le prendre avec ' + sanFr(replyInfo.san) + '.');
          }
        }
        if (bestInfo && !mateBefore) {
          if (bestInfo.captured && VAL[bestInfo.captured] >= 3 && !(mv.captured && VAL[mv.captured] >= VAL[bestInfo.captured])) {
            var bAfter = fenBoard(bestInfo.fenAfter);
            var defended = attackers(bAfter, bestInfo.to, mover === 'w' ? 'b' : 'w').length > 0;
            tags.push('gain_rate');
            reasons.push((defended ? 'Tu pouvais gagner du matériel : ' : 'Il y avait une pièce gratuite : ') + sanFr(bestSan) + ' prend ' + NAME_OPP[bestInfo.captured] + ' en ' + bestInfo.to + '.');
          } else {
            var ft = forkTargets(bestInfo.fenAfter, bestInfo.to);
            if (ft.length >= 2) {
              tags.push('fourchette_ratee');
              reasons.push('Attaque double possible : ' + sanFr(bestSan) + ' vise en même temps ' + ft.slice(0, 2).map(function (t) { return NAME_OPP[t.type] + ' (' + t.sq + ')'; }).join(' et ') + '.');
            } else if (bestInfo.check && loss >= 12) {
              tags.push('echec_rate');
              reasons.push('Il y avait un coup fort avec échec : ' + sanFr(bestSan) + (evB.pv && evB.pv.length > 2 ? ' (suite : ' + pvSan(fenB, evB.pv, 5).map(sanFr).join(' ') + ')' : '') + '.');
            }
          }
        }
        if (tags.indexOf('pas_puni') >= 0) reasons.push('L’adversaire venait de faire une faute, et ce coup ne la punit pas.');
        // principes d'ouverture
        if (i < 20 && BAD[cls]) {
          if (mv.piece === 'q' && i < 10 && !mv.captured) { tags.push('dame_tot'); reasons.push('Sortir la dame si tôt l’expose aux attaques : développe d’abord cavaliers et fous.'); }
          else if (mv.piece === 'k' && mv.flags.indexOf('k') < 0 && mv.flags.indexOf('q') < 0) { tags.push('roi_bouge'); reasons.push('Bouger le roi en ouverture te fait perdre le droit de roquer.'); }
          else if (i >= 2 && game.moves[i - 2] && game.moves[i - 2].to === mv.from && mv.piece !== 'p' && !mv.captured && !/\+/.test(mv.san)) { tags.push('meme_piece'); reasons.push('Rejouer la même pièce en ouverture fait perdre du temps de développement.'); }
        }
      }
      // horloge
      var spent = game.spent.length ? game.spent[i] : null;
      var clock = game.clocks.length ? game.clocks[i] : null;
      if (BAD[cls] && cls !== 'imprecision') {
        if (spent != null && spent < 2.5) { tags.push('trop_vite'); reasons.push('Joué en ' + fmtTime(spent) + ' : prends une seconde pour vérifier les menaces adverses avant de jouer.'); }
        var low = clock != null && (clock < 20 || (game.base && clock < game.base * 0.1));
        if (low) { tags.push('zeitnot'); reasons.push('Il ne te restait que ' + fmtTime(clock) + ' à la pendule.'); }
      }
      if (BAD[cls] && !reasons.length && bestSan) {
        reasons.push('Le meilleur coup était ' + sanFr(bestSan) + '.');
      }
      if (BAD[cls] || cls === 'bon') {
        var gain = (sgn * cpOf(evB) - sgn * cpOf(evA)) / 100;
        if (Math.abs(gain) < 50 && Math.abs(sgn * cpOf(evB)) < 2000 && Math.abs(sgn * cpOf(evA)) < 2000) comment = 'L’évaluation passe de ' + fmtEval(evB) + ' à ' + fmtEval(evA) + '.';
      }
      if (cls === 'brillant') reasons.push('Sacrifice correct : tu laisses du matériel en prise, mais le moteur confirme que c’est le meilleur choix.');
      if (cls === 'unique') reasons.push('Seul bon coup de la position : les autres coups perdaient nettement l’avantage.');
      if (cls === 'meilleur' && !reasons.length) reasons.push('C’est le coup du moteur.');

      out.push({
        ply: i, mover: mover, san: game.sans[i], cls: cls, loss: Math.round(loss * 10) / 10, acc: Math.round(acc * 10) / 10,
        wBefore: wBefore, wAfter: wAfter, best: evB.best, bestSan: bestSan,
        bestLine: evB.pv ? pvSan(fenB, evB.pv, 6) : [],
        tags: tags, reasons: reasons, evalNote: comment, spent: spent, clock: clock,
        phase: phaseOf(fenB, i)
      });
    }
    return out;
  }

  function harmonic(arr) {
    if (!arr.length) return null;
    var s = 0; arr.forEach(function (a) { s += 1 / Math.max(a, 1); });
    return arr.length / s;
  }
  function accuracy(rev, color) {
    var a = rev.filter(function (r) { return r && r.mover === color && r.cls !== 'force'; }).map(function (r) { return r.acc; });
    if (!a.length) return null;
    var mean = a.reduce(function (x, y) { return x + y; }, 0) / a.length;
    return Math.round(((mean + harmonic(a)) / 2) * 10) / 10;
  }
  function counts(rev, color) {
    var c = {};
    Object.keys(CLASSES).forEach(function (k) { c[k] = 0; });
    rev.forEach(function (r) { if (r && r.mover === color) c[r.cls]++; });
    return c;
  }
  function keyMoments(rev, color, n) {
    return rev.filter(function (r) { return r && (!color || r.mover === color) && BAD[r.cls]; })
      .sort(function (a, b) { return b.loss - a.loss; }).slice(0, n || 3)
      .sort(function (a, b) { return a.ply - b.ply; });
  }

  // ---------- Statistiques sur toutes les parties ----------
  var TAG_LABELS = {
    piece_laissee_en_prise: 'Pièce laissée sans défense',
    piece_deplacee_en_prise: 'Pièce jouée sur une case attaquée',
    gain_rate: 'Matériel gratuit non pris',
    fourchette_ratee: 'Attaque double non vue',
    echec_rate: 'Échec gagnant non vu',
    mat_rate: 'Mat non vu',
    mat_concede: 'Mat adverse non vu',
    pas_puni: 'Faute adverse non punie',
    trop_vite: 'Coup joué trop vite',
    zeitnot: 'Pendule presque vide',
    dame_tot: 'Dame sortie trop tôt',
    roi_bouge: 'Roi déplacé sans roquer',
    meme_piece: 'Même pièce jouée deux fois'
  };

  function aggregate(items, username) {
    // items : [{game, me, rev?}]
    var res = { total: items.length, V: 0, N: 0, D: 0, byColor: { w: { V: 0, N: 0, D: 0 }, b: { V: 0, N: 0, D: 0 } }, elo: [], openings: {}, ends: { V: {}, D: {} }, hours: {}, session: {}, afterResult: { V: { V: 0, N: 0, D: 0 }, D: { V: 0, N: 0, D: 0 } } };
    var sorted = items.slice().sort(function (a, b) { return (a.game.ts || 0) - (b.game.ts || 0); });
    var lastTs = null, posInSession = 0, lastRes = null;
    sorted.forEach(function (it) {
      var g = it.game, me = it.me; if (!me) return;
      var r = myResult(g, me);
      if (r === '?') return;
      res[r]++; res.byColor[me][r]++;
      var elo = me === 'w' ? g.whiteElo : g.blackElo;
      if (elo && g.ts) res.elo.push({ ts: g.ts, elo: elo, tclass: g.tclass });
      var opKey = (me === 'w' ? 'Blancs · ' : 'Noirs · ') + (g.opening || g.eco || 'Ouverture inconnue');
      var op = res.openings[opKey] || (res.openings[opKey] = { name: g.opening || g.eco || 'Ouverture inconnue', color: me, n: 0, pts: 0, V: 0, N: 0, D: 0 });
      op.n++; op.pts += r === 'V' ? 1 : r === 'N' ? 0.5 : 0; op[r]++;
      if (r !== 'N') { var er = endReason(g); res.ends[r][er] = (res.ends[r][er] || 0) + 1; }
      if (g.ts) {
        var hr = new Date(g.ts).getHours();
        var slot = hr < 6 ? 'nuit' : hr < 12 ? 'matin' : hr < 18 ? 'après-midi' : 'soir';
        var hs = res.hours[slot] || (res.hours[slot] = { n: 0, pts: 0 });
        hs.n++; hs.pts += r === 'V' ? 1 : r === 'N' ? 0.5 : 0;
        if (lastTs != null && g.ts - lastTs < 25 * 60 * 1000) posInSession++; else posInSession = 1;
        var key = posInSession >= 4 ? '4+' : String(posInSession);
        var ss = res.session[key] || (res.session[key] = { n: 0, pts: 0 });
        ss.n++; ss.pts += r === 'V' ? 1 : r === 'N' ? 0.5 : 0;
        if (lastRes && lastRes !== 'N' && posInSession > 1) res.afterResult[lastRes][r]++;
        lastTs = g.ts;
      }
      lastRes = r;
    });

    // statistiques moteur
    var an = items.filter(function (it) { return it.rev && it.me; });
    var eng = { games: an.length, moves: 0, acc: [], phase: { ouverture: [], milieu: [], finale: [] }, cls: {}, tags: {}, spentB: {}, clockB: {} };
    Object.keys(CLASSES).forEach(function (k) { eng.cls[k] = 0; });
    function bucket(o, k, bad) { var x = o[k] || (o[k] = { n: 0, bad: 0 }); x.n++; if (bad) x.bad++; }
    an.forEach(function (it) {
      var a = accuracy(it.rev, it.me); if (a != null) eng.acc.push(a);
      it.rev.forEach(function (r) {
        if (!r || r.mover !== it.me) return;
        eng.moves++;
        eng.cls[r.cls]++;
        if (r.cls !== 'force') eng.phase[r.phase].push(r.acc);
        var bad = r.cls === 'erreur' || r.cls === 'gaffe' || r.cls === 'manquee';
        r.tags.forEach(function (t) { if (t !== 'trop_vite' && t !== 'zeitnot' && !bad && r.cls !== 'imprecision') return; eng.tags[t] = (eng.tags[t] || 0) + 1; });
        if (r.spent != null && r.ply >= 6) bucket(eng.spentB, r.spent < 2 ? '< 2 s' : r.spent < 5 ? '2–5 s' : r.spent < 15 ? '5–15 s' : '> 15 s', bad);
        if (r.clock != null) bucket(eng.clockB, r.clock > 60 ? '> 1 min' : r.clock > 20 ? '20–60 s' : '< 20 s', bad);
      });
    });
    function avg(a) { return a.length ? Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length * 10) / 10 : null; }
    eng.accAvg = avg(eng.acc);
    eng.phaseAvg = { ouverture: avg(eng.phase.ouverture), milieu: avg(eng.phase.milieu), finale: avg(eng.phase.finale) };
    eng.blundersPerGame = an.length ? Math.round((eng.cls.gaffe + eng.cls.manquee) / an.length * 10) / 10 : null;
    res.engine = eng;
    return res;
  }

  function mainWeakness(agg) {
    var e = agg.engine; if (!e || !e.games) return null;
    var tags = Object.keys(e.tags).map(function (k) { return { k: k, n: e.tags[k] }; }).sort(function (a, b) { return b.n - a.n; });
    if (!tags.length) return null;
    return { key: tags[0].k, label: TAG_LABELS[tags[0].k] || tags[0].k, n: tags[0].n, perGame: Math.round(tags[0].n / e.games * 10) / 10 };
  }

  var Core = {
    VAL: VAL, NAME: NAME, CLASSES: CLASSES, BAD: BAD, TAG_LABELS: TAG_LABELS,
    sanFr: sanFr, splitPgns: splitPgns, parseGame: parseGame, myColor: myColor, myResult: myResult, endReason: endReason,
    cpOf: cpOf, winPct: winPct, fmtEval: fmtEval, fmtTime: fmtTime, fenBoard: fenBoard, attackers: attackers,
    hangingPieces: hangingPieces, forkTargets: forkTargets, uciInfo: uciInfo, pvSan: pvSan, phaseOf: phaseOf,
    review: review, accuracy: accuracy, counts: counts, keyMoments: keyMoments, aggregate: aggregate, mainWeakness: mainWeakness,
    hashStr: hashStr
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core; else root.Core = Core;
})(typeof window !== 'undefined' ? window : this);
