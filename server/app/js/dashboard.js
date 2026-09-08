import { apiFetch } from './api.js';
import { guard } from './auth.js';
import { el, badge, mountChrome } from './ui.js';

if (await guard()) {
  mountChrome('dashboard', 'Proyectos activos');
  loadProjects();

  window.addEventListener('pageshow', () => {
    loadProjects();
  });
}

async function loadProjects() {
  const listEl = document.getElementById('projects-list');
  listEl.textContent = '';

  let proyectos;
  try {
    proyectos = await apiFetch('/proyectos');
  } catch {
    listEl.appendChild(el('div', { className: 'empty-state', text: 'No se pudieron cargar los proyectos.' }));
    return;
  }

  const activos = (proyectos || []).filter((p) => p.estado !== 'finalizado');

  if (activos.length === 0) {
    listEl.appendChild(el('div', { className: 'empty-state' }, [
      el('p', { text: 'No hay proyectos activos.' }),
      el('a', { href: '/app/proyectos.html?new=1', className: 'btn btn-primary mt-16', text: '+ Nuevo proyecto' }),
    ]));
    return;
  }

  for (const p of activos) {
    listEl.appendChild(buildCard(p));
  }
}

function buildCard(p) {
  const card = el('div', { className: 'card project-card' });

  const top = el('div', { className: 'project-card__top' }, [
    el('div', {}, [
      el('div', { className: 'project-card__name', text: p.nombre }),
      el('div', { className: 'project-card__client', text: p.cliente_nombre || 'Sin cliente' }),
    ]),
    badge(p.estado),
  ]);
  card.appendChild(top);

  if (p.tipo_servicio) {
    card.appendChild(el('div', { className: 'text-muted', text: p.tipo_servicio }));
  }

  const actions = el('div', { className: 'project-card__actions' }, [
    el('a', { href: `/app/proyecto.html?id=${p.id}`, className: 'btn btn-secondary btn-sm' }, [
      el('i', { className: 'ti ti-eye' }), ' Ver proyecto',
    ]),
    el('a', { href: `/app/proyecto.html?id=${p.id}&action=horas`, className: 'btn btn-secondary btn-sm' }, [
      el('i', { className: 'ti ti-clock' }), ' Añadir horas',
    ]),
    el('a', { href: `/app/proyecto.html?id=${p.id}&action=gasto`, className: 'btn btn-secondary btn-sm' }, [
      el('i', { className: 'ti ti-receipt' }), ' Añadir gasto',
    ]),
  ]);
  card.appendChild(actions);

  card.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    window.location.href = `/app/proyecto.html?id=${p.id}`;
  });

  return card;
}
