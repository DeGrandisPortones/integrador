'use strict';

const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, '..', 'server.js');
let content = fs.readFileSync(serverPath, 'utf8');

const requireLine = "const { installIpanelSyncRoutes } = require('./ipanelSyncModule');\n";
if (!content.includes(requireLine.trim())) {
  const marker = "} = require('./measurementMappings');\n";
  if (!content.includes(marker)) {
    throw new Error('No se encontro el bloque require de measurementMappings en server.js');
  }
  content = content.replace(marker, `${marker}${requireLine}`);
}

const installBlock = `
// =====================
// IPANEL: Paneles.dbo.NTASVTAS -> public.ipanel
// =====================
installIpanelSyncRoutes({ app, sql, getSqlPool, supabasePool, requireAuth, attachRole, requireRole });
`;

if (!content.includes('installIpanelSyncRoutes({ app, sql, getSqlPool, supabasePool, requireAuth, attachRole, requireRole })')) {
  const listenMatch = content.match(/\napp\.listen\s*\(/);
  if (!listenMatch || listenMatch.index === undefined) {
    throw new Error('No se encontro app.listen(...) para insertar las rutas de ipanel antes de levantar el server');
  }
  content = `${content.slice(0, listenMatch.index)}${installBlock}${content.slice(listenMatch.index)}`;
}

fs.writeFileSync(serverPath, content, 'utf8');
console.log('server.js actualizado con rutas /api/ipanel, /api/ipanel/last-sync y /api/sync/ipanel');
