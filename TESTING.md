# Testing — Figma Accessibility Audit Plugin (Phase 1)

Este archivo es tu checklist para validar Phase 1 contra un archivo Figma de prueba.

---

## 1. Crear el archivo de prueba en Figma

Crea un nuevo archivo Figma vacío llamado `a11y-audit-fixture` y dentro de la página por defecto añade los siguientes nodos. Los valores entre paréntesis son los esperados, no los pongas como texto del nodo.

### Frame raíz
- 1 frame `Test Page` de **800×1200px**, fondo blanco (`#FFFFFF`)

### Nodos de texto con contraste **insuficiente** (deben fallar)
> Estos deben aparecer como issues `critical` o `serious`.

1. `bad-1` — texto `"Lorem ipsum"`, fuente Inter 16px Regular, color `#CCCCCC` sobre fondo blanco (ratio ~1.6:1, **critical**)
2. `bad-2` — texto `"Click here"`, fuente Inter 14px Regular, color `#999999` sobre fondo blanco (ratio ~2.8:1, **serious**)
3. `bad-3` — texto `"Subtítulo"`, fuente Inter 16px Regular, color `#B0B0B0` sobre fondo blanco (ratio ~2.4:1, **critical**)

### Nodos de texto con contraste **correcto** (NO deben fallar)
> Estos NO deben aparecer en la lista de issues.

4. `good-1` — texto `"Body copy"`, Inter 16px Regular, color `#1A1A1A` sobre `#FFFFFF` (ratio ~16.7:1, pasa AA)
5. `good-2` — texto `"Title"`, Inter 24px Bold, color `#1A1A1A` sobre `#FFFFFF` (pasa AA large)
6. `good-3` — texto `"Caption"`, Inter 12px Regular, color `#444444` sobre `#FFFFFF` (ratio ~9.7:1, pasa AA)

### Texto sobre fondo de color
7. Crea un sub-frame `Card` de 300×120px con fondo `#1E3A5F` (azul blueprint).
   Dentro coloca:
   - `over-color` — texto `"On dark"`, Inter 16px Regular, color `#FFFFFF` (debe pasar)
   - `over-color-bad` — texto `"Hard to read"`, Inter 16px Regular, color `#888888` sobre `#1E3A5F` (debe fallar)

### Texto con fuentes mixtas
8. `mixed-weights` — un único nodo de texto con la frase `"Hello World"` donde:
   - `"Hello "` esté en Inter Bold 16px color `#1A1A1A`
   - `"World"` esté en Inter Regular 16px color `#CCCCCC`
   > Esto fuerza `fills === figma.mixed`. El segmento `"World"` debe fallar; `"Hello"` debe pasar.

### Tamaños límite
9. `small-text` — texto `"Tiny print"`, Inter **11px** Regular, color `#1A1A1A` sobre blanco
   > El contraste pasa, pero servirá de fixture para Phase 2 (text-size check).
10. `large-text` — texto `"Big heading"`, Inter **24px** Regular, color `#959595` sobre blanco
    > Como es "large" (≥18px), el umbral baja a 3.0:1. Verifica si pasa o falla según el ratio real.

---

## 2. Cómo cargar el plugin en Figma desktop

> Estas instrucciones se completarán cuando el build esté listo (Step 11 del prompt). Por ahora, déjalo como referencia:

1. Abre Figma desktop (no el browser; Manifest V2 necesita desktop).
2. Menú → `Plugins` → `Development` → `Import plugin from manifest...`
3. Selecciona `dist/manifest.json` del repo.
4. Abre el archivo `a11y-audit-fixture`.
5. `Plugins` → `Development` → `Figma A11y Audit`.

---

## 3. Checklist de éxito Phase 1

Marca cada uno cuando lo verifiques. **Todos deben pasar para considerar Phase 1 completo.**

### Scan
- [ ] Al abrir el plugin aparece la `WelcomeView` con el botón "Run audit"
- [ ] Al hacer click en "Run audit" la UI cambia al estado "scanning"
- [ ] La consola del sandbox muestra logs de progreso (cada ~50 nodos)
- [ ] El scan termina y aparece la `ResultsListView`

### Detección
- [ ] La lista contiene **al menos 4 issues** (los 3 bad-* + el segmento "World" del mixed)
- [ ] El issue de `bad-1` aparece como `critical` (ratio ~1.6 < 4.5*0.7)
- [ ] El issue de `bad-2` aparece como `serious`
- [ ] El issue del segmento "World" en `mixed-weights` aparece (no pierde el segmento por ser MIXED)
- [ ] El issue de `over-color-bad` aparece (calcula bien el background del card azul)
- [ ] **Ningún** `good-*` aparece en la lista
- [ ] Cada row muestra: severity dot, mensaje, breadcrumb (path), criterio WCAG `1.4.3`

### Overlay
- [ ] Tras el scan aparece un frame `[a11y-overlay]` en la página
- [ ] Cada nodo afectado tiene un dot circular de 16×16 en su esquina superior derecha
- [ ] Los dots están coloreados según severidad
- [ ] Los dots tienen halo crema (`#F5F1E8`) de 2px
- [ ] Si vuelves a ejecutar el scan, el overlay anterior se limpia (no se acumulan dots)

### Navegación
- [ ] Click en una row de la lista → el viewport hace zoom al nodo y lo selecciona
- [ ] Click en un dot del canvas → selecciona el nodo afectado real (no el dot)

### Arquitectura
- [ ] No hay imports de `figma.*` en `src/shared/` ni en `src/sandbox/detect/checks/` (verifica con grep)
- [ ] El scan funciona también con `Selection: page` (es el único scope soportado en esta phase)

---

## 4. Notas para reportar

Si algo falla, captura:
- Log de la consola del sandbox (`Plugins → Development → Show/Hide console`)
- Screenshot de la UI en estado erróneo
- Lista de qué issues aparecen vs qué esperabas

Esto nos ayuda a iterar antes de pasar a Phase 2.
