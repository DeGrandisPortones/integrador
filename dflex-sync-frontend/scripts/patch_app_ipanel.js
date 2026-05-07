/*
 * Patch App.jsx para agregar la seccion Ipanels al frontend.
 * Uso:
 *   cd dflex-sync-frontend
 *   node scripts/patch_app_ipanel.js
 */

const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'src', 'App.jsx');

if (!fs.existsSync(appPath)) {
  console.error(`No se encontro App.jsx en: ${appPath}`);
  process.exit(1);
}

let content = fs.readFileSync(appPath, 'utf8');

if (!content.includes("import IpanelsPage from './pages/IpanelsPage';")) {
  content = content.replace(
    "import PortonesPage from './pages/PortonesPage';",
    "import PortonesPage from './pages/PortonesPage';\nimport IpanelsPage from './pages/IpanelsPage';"
  );
}

if (!content.includes("currentPage === 'ipanels'")) {
  const portonesButton = `            <button
              type="button"
              className={currentPage === 'portones' ? 'nav-btn active' : 'nav-btn'}
              onClick={() => setCurrentPage('portones')}
            >
              Portones (Enviar a Odoo)
            </button>`;

  const ipanelsButton = `${portonesButton}

            <button
              type="button"
              className={currentPage === 'ipanels' ? 'nav-btn active' : 'nav-btn'}
              onClick={() => setCurrentPage('ipanels')}
            >
              Ipanels
            </button>`;

  if (!content.includes(portonesButton)) {
    console.error('No se encontro el boton de Portones para insertar Ipanels. Revisar App.jsx manualmente.');
    process.exit(1);
  }

  content = content.replace(portonesButton, ipanelsButton);
}

if (!content.includes('<IpanelsPage authHeader={authHeader} canSyncIpanel={canSyncOdoo} />')) {
  const portonesRender = `      {currentPage === 'portones' && (
        <PortonesPage authHeader={authHeader} canSyncOdoo={canSyncOdoo} />
      )}`;

  const ipanelsRender = `${portonesRender}

      {currentPage === 'ipanels' && (
        <IpanelsPage authHeader={authHeader} canSyncIpanel={canSyncOdoo} />
      )}`;

  if (!content.includes(portonesRender)) {
    console.error('No se encontro el render de Portones para insertar Ipanels. Revisar App.jsx manualmente.');
    process.exit(1);
  }

  content = content.replace(portonesRender, ipanelsRender);
}

fs.writeFileSync(appPath, content, 'utf8');
console.log('OK: App.jsx actualizado con la seccion Ipanels.');
