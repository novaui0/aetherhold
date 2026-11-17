(function () {
  var test = window.testHarness && window.testHarness.addTest;
  if (!test) return;

  test({
    name: 'loadscreenSequence',
    skip: window.platform && window.platform.loader,
    description: 'boot shows while connecting, loading screen shows on world entry, boot element reused not removed',
    files: ['public/js/main.js', 'public/js/audio.js', 'public/js/world.js', 'public/js/loadscreen.js'],
    setup: runBody,
    body: function () {
      var pass = true;
      var notes = [];

      var bootEl = document.getElementById('boot');
      var loadEl = document.getElementById('loading-screen');
      if (!bootEl || !loadEl) {
        pass = false;
        notes.push('boot or loading-screen element missing');
        return { ok: false, why: notes.join('\n') };
      }

      bootEl.classList.add('hidden');
      loadEl.classList.add('hidden');

      var hostBoot = window.boot;
      var hostStartSession = window.startSession;
      window.boot = function () {
        window.boot = hostBoot;
        return hostBoot.call(window);
      };
      window.startSession = function (opts) {
        window.startSession = hostStartSession;
        return hostStartSession.call(window, opts);
      };

      var logged = [];
      var writer = (window.console && console.log);
      if (writer) {
        console.log = function () { logged.push(Array.prototype.join.call(arguments, ' ')); };
      }

      try { window.boot(); } catch (e) {
        pass = false;
        notes.push('boot() threw: ' + (e && e.message || e));
      }
      if (writer) setTimeout(function () { console.log = writer; }, 800);

      if (!pass) return { ok: false, why: notes.join('\n') };

      window._raf(window.step);
      window._raf(window.step);

      if (bootEl.classList.contains('hidden')) {
        pass = false;
        notes.push('boot not shown during server connect');
      } else {
        notes.push('boot shown during connect: ok');
      }

      window._bootResolve && window._bootResolve({});
      window._raf(window.step);

      // loading screen should appear during world entry (startSession)
      var loadShown = false;
      if (window.LoadScreen && window.LoadScreen.prototype && window.LoadScreen.prototype.show) {
        var origShow = window.LoadScreen.prototype.show;
        window.LoadScreen.prototype.show = function (msg, sub) {
          loadShown = true;
          return origShow.call(this, msg, sub);
        };
      }

      window._startSessionResolve && window._startSessionResolve({
        playerId: 'u1',
        region: 'test',
        player: { id: 'u1', name: 'You', cls: 'wanderer' },
        settings: {
          quality: 'medium', shadows: true, sfx: true, music: true,
          master: 80, ambience: 60
        },
        editor: {}
      });

      window._raf(function () {
        window._raf(function () {
          window._raf(function () {
            if (loadShown) notes.push('loading screen shown on world entry: ok');
            else {
              pass = false;
              notes.push('loading screen not shown on world entry');
            }

            // boot hidden but NOT removed
            if (!bootEl.parentNode) {
              pass = false;
              notes.push('boot element was removed instead of hidden');
            } else if (bootEl.classList.contains('hidden')) {
              notes.push('boot hidden after loading screen takeover: ok');
            } else {
              notes.push('boot still visible after loading screen: ok (may transition later)');
            }

            window.startSession = hostStartSession;
            window.boot = hostBoot;
            if (writer) console.log = writer;

            return {
              ok: pass,
              why: notes.join('\n')
            };
          });
        });
      });
    }
  });
})();
