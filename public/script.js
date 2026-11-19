(() => {
  const header = document.getElementById('header');
  const toggle = document.getElementById('menuToggle');
  const nav = document.getElementById('navigation');
  const progress = document.getElementById('progress');

  // Mobile menu
  const setMenu = (open) => {
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  toggle.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

  // Scroll: header glass + progress bar
  const onScroll = () => {
    header.classList.toggle('scrolled', scrollY > 20);
    const total = document.documentElement.scrollHeight - innerHeight;
    progress.style.width = (total > 0 ? (scrollY / total) * 100 : 0) + '%';
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Reveal on scroll
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
    }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.reveal').forEach((el, i) => {
      el.style.transitionDelay = (i % 3) * 80 + 'ms';
      io.observe(el);
    });
  } else {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
  }

  // Subtle tilt on the hero product
  const stage = document.querySelector('.tilt');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (stage && !reduce && matchMedia('(pointer: fine)').matches) {
    const hero = document.querySelector('.hero');
    hero.addEventListener('mousemove', e => {
      const r = hero.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      stage.style.transform = `rotate(-6deg) perspective(900px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg)`;
    });
    hero.addEventListener('mouseleave', () => { stage.style.transform = ''; });
  }

  document.getElementById('year').textContent = new Date().getFullYear();

  // Contact form
  const form = document.getElementById('contactForm');
  const status = document.getElementById('formStatus');
  const btn = form.querySelector('button[type=submit]');
  const label = btn.querySelector('.btn-label');

  // Links like "Enquire about NeoVoice" pre-select the topic
  document.querySelectorAll('[data-topic]').forEach(a => a.addEventListener('click', () => {
    form.topic.value = a.dataset.topic;
  }));

  const setStatus = (msg, kind) => { status.textContent = msg; status.className = 'form-status ' + (kind || ''); };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    let firstBad = null;
    ['name', 'email', 'message'].forEach(n => {
      const f = form[n];
      const bad = !f.value.trim() || (n === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.value.trim()));
      f.setAttribute('aria-invalid', String(bad));
      if (bad && !firstBad) firstBad = f;
    });
    if (firstBad) { setStatus('Please fill in your name, a valid email and a message.', 'err'); firstBad.focus(); return; }

    btn.disabled = true; label.textContent = 'Sending…'; setStatus('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form)))
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      form.reset();
      setStatus('Thank you — your message has been sent. We\'ll get back to you soon.', 'ok');
    } catch (err) {
      setStatus((err.message || 'Could not send.') + ' You can also email cresvyn.tech@gmail.com.', 'err');
    } finally {
      btn.disabled = false; label.textContent = 'Send message';
    }
  });
})();
