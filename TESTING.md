# Testing — Figma Accessibility Audit Plugin

Checklist de validación manual contra un archivo Figma de prueba.

> Secciones 1–3: fixture y checklist de check 01 (text contrast). Secciones 4–5: fixtures de los checks 02–06.
> Sección 7: smoke test de v0.5 — anotaciones en canvas, auto-fixes de focus, alt text con asignación real y Ollama.

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

---

## 4. Phase 2 Acelerado — fixtures completos para los 6 checks

Añade estos al archivo `a11y-audit-fixture`. Los fixtures de los puntos 1-10 ya cubren check 01 (contraste de texto) y se mantienen.

### Tap-target (check 03)

11. `Button / Sign up` — frame de **18×24px**, fondo `#1E3A5F`, con texto blanco "Sign up". Renómbralo `button-sign-up` (token `button` o `btn` en el name). Esperado: **serious** (16-24px).
12. `btn-tiny` — frame de **12×12px**. Esperado: **critical**.
13. `btn-ok` — frame de **24×24px**, con un sibling `btn-also-ok` de 24×24px **a 1px** de distancia. Esperado: **moderate** (cumple 24 pero spacing < 24).
14. `btn-perfect` — frame de **48×48px** con spacing >= 24px. Esperado: **no issue**.
15. `cta-large` — frame de **44×44px** con spacing >= 24px. Esperado: **no issue**.

### Focus-state defined (check 05)

16. **Component Set** llamado `Button` con propiedad `State` y 4 variantes: `Default`, `Hover`, `Pressed`, `Disabled`. **NO añadas Focus.** Esperado: **serious** "Missing focus state variant".

17. **Component Set** llamado `Input` con `State=Default` / `State=Focus` / `State=Error`. Esperado: **no issue** del check 05.

### UI contrast (check 02)

18. `TextField / outline` — frame de **240×40px**, fondo blanco, **stroke `#D1D1D1` 1px**. Renómbralo `textfield-outline` (token `textfield`). Esperado: **serious** o **critical** (ratio ~1.39:1 vs blanco, < 3:1).
19. `TextField / focus` — frame de 240×40px, fondo blanco, **stroke `#1E3A5F` 2px**. Renómbralo `textfield-focus`. Esperado: **no issue** (ratio ~13.6:1).
20. `icon-search` — vector cuadrado de 24×24px con SOLID fill `#B8B8B8` sobre fondo blanco. Esperado: **moderate** o **serious** (ratio ~2.0:1 < 3:1).
21. `icon-search-good` — mismo nodo, fill `#1A1A1A`. Esperado: **no issue**.
22. `card` — frame 200×120px, fill `#F5F1E8`, **stroke `#F5F1E8`** (mismo color que fill). Esperado: **no issue** (decorative-border guard).

### Text size (check 04)

23. `caption-small` — texto `"Tiny print"`, Inter **9px** Regular, color `#1A1A1A`. **Sin** ancestor con name `caption|legal|disclaimer`. Esperado: **serious** (`< 10px hard floor`).
24. `body-too-small` — texto Inter **11px**. Esperado: **minor** (`< 12px recomendado`).
25. `body-ok` — texto Inter **14px**. Esperado: **no issue**.
26. **Excepción**: pon el nodo `small-text` de 11px (del fixture original, punto 9) dentro de un frame llamado `Footer / Legal`. Esperado: **no issue** (la excepción `legal` baja el floor a 10px).

### Focus visibility (check 06)

27. **Component Set** `IconButton` con propiedad `State`:
    - `State=Default` — frame 32×32px, fondo `#1E3A5F`, **sin stroke**.
    - `State=Focus` — mismo frame, **stroke `#3D5A80` 1px** (color similar al fondo).
    Esperado: **serious** del check 06 (1px < 2px **y** ratio ~1.4:1 < 3:1). El check 05 no flagea (focus existe).

28. **Component Set** `IconButton2` con `State=Default` y `State=Focus`. La variante focus añade **stroke `#FFB400` 3px** sobre fondo `#1E3A5F`. Esperado: **no issue** del check 06 (3px ≥ 2px y ratio ~7.5:1 ≥ 3:1).

---

## 5. Phase 2 Acelerado — checklist de éxito

### Numbering sincronizado
- [ ] Tras el scan, los dots del canvas muestran un número en blanco (1, 2, 3, …)
- [ ] La columna de la izquierda de cada row de la lista muestra el mismo número
- [ ] El orden es: critical → serious → moderate → minor (estables entre rescans)
- [ ] Al dismiss-ear un issue, los números se renumeran 1..N en lista y canvas

### Detección de los 6 checks (Tier 1 completo)
- [ ] La lista contiene issues de los 6 check IDs: `01-text-contrast`, `02-ui-contrast`, `03-tap-target`, `04-text-size`, `05-focus-defined`, `06-focus-visibility`
- [ ] El stat strip muestra los counts correctos por severidad
- [ ] **Check 01**: `"Text #7A7A7A on #FFFFFF has contrast 2.10:1 (needs 4.5:1 for normal text at 16px, AA)"`
- [ ] **Check 02**: `"Border 'textfield-outline' (#D1D1D1) on #FFFFFF has contrast 1.39:1 (needs 3.0:1, AA)."` y/o `"Icon 'icon-search' (#B8B8B8) on #FFFFFF …"`
- [ ] **Check 03**: `"'button-sign-up' is 18×24px, needs 24px minimum. Spacing to neighbors: …"`
- [ ] **Check 04**: `"Text size 9px is below 10px hard floor."` o `"Text size 11px is below 12px recommended minimum."`
- [ ] **Check 05**: `"'Button' component has variants: Default, Hover, Pressed, Disabled. Missing focus state variant …"`
- [ ] **Check 06**: `"'IconButton' focus variant is present but indicator is 1px thick (needs 2px) and indicator contrast is 1.39:1 (needs 3.0:1)."`

### False-positive guards
- [ ] `card` con stroke == fill **NO** aparece en check 02 (decorative-border guard)
- [ ] `Input` con `State=Focus` **NO** aparece en check 05
- [ ] `IconButton2` con focus 3px sólido amarillo **NO** aparece en check 06
- [ ] `Footer / Legal` aplicado al nodo de 11px **NO** aparece en check 04 (excepción)

### DetailDrawer
- [ ] Click en una row → entra al drawer (sin animación)
- [ ] El drawer muestra: severity chip, título descriptivo, mensaje, WCAG criterion+level+title
- [ ] Sección LOCATION con breadcrumb y "Jump to canvas →" funcional
- [ ] Sección DETAILS con valores formateados según el check:
  - 01 → Text / Background / Current ratio / Required / Size
  - 02 → Element type / Element color / Background / Current ratio / Required (+ Stroke weight si aplica)
  - 03 → Size / Min dimension / Spacing / Required
  - 04 → Font size / Recommended min / Hard floor (+ Exception si aplica)
  - 05 → Existing variants (+ Suggested prop)
  - 06 → Focus variant / Compared with / Indicator thickness / Indicator color / Indicator contrast / Background
- [ ] Para issues de check 01 aparece sección PREVIEW con dos celdas (CURRENT vs SUGGESTED) mostrando "Aa" y el ratio
- [ ] Para checks 02, 03, 04, 05 y 06 NO aparece "Apply fix" (solo "Dismiss")
- [ ] "Why this matters" colapsable existe para los 6 checks con texto educativo distinto

### Apply fix
- [ ] Click en "Apply fix" sobre un issue de contraste → en el canvas el text node cambia de color al hex sugerido
- [ ] La row del issue se marca como `resolved` (chip verde) en el drawer y desaparece o se atenúa al volver a la lista
- [ ] Re-running el scan no vuelve a flagear ese node si el fix lo lleva sobre el threshold

### Dismiss
- [ ] Click en "Dismiss" → el issue desaparece de la lista
- [ ] El dot correspondiente desaparece del canvas
- [ ] La numeración se reajusta (ya no quedan huecos)

### Hover sync
- [ ] Hover sobre una row → la row resalta su fondo
- [ ] (Sandbox-side glow es v0.2; en Phase 2 el highlight-node es noop pero el mensaje se envía sin errores)

### Click en dot del canvas
- [ ] Click en un dot del canvas → la row correspondiente se marca con border-left azul y hace scroll-into-view

### Arquitectura
- [ ] `grep -rn "figma\\." src/shared/ src/sandbox/detect/checks/ src/sandbox/detect/primitives/` solo devuelve matches en comentarios (no imports ni llamadas)
- [ ] `npm run build` pasa sin errores de TS

---

## 6. Notas para reportar

Si algo falla, captura:
- Log de la consola del sandbox (`Plugins → Development → Show/Hide console`)
- Screenshot de la UI en estado erróneo
- Lista de qué issues aparecen vs qué esperabas

---

## 7. Smoke test v0.5 — checks 02–06, anotaciones y auto-fixes

### Fixture adicional
En el mismo archivo de prueba añade:
- Un component set `Button/Primary` con variantes `State=Default, State=Hover, State=Pressed` (sin Focus) — debe disparar **check 05**.
- Un component set `Input/Field` con `State=Default` y `State=Focus` donde la variante Focus tenga un stroke de 1px gris claro — debe disparar **check 06**.
- Un frame `icon-button` de 18×18px junto a otro botón a 8px de distancia — debe disparar **check 03** (serious).
- Un texto de 9px — debe disparar **check 04** (serious, bajo el hard floor).
- Una imagen (fill de imagen) dentro de un frame.

### Checks y fixes
- [ ] Check 05 aparece; en el drawer, **Create focus variant** crea la variante `State=Focus` dentro del set, con ring azul, y hace zoom a ella
- [ ] Check 06 aparece; **Strengthen indicator** aplica el ring a la variante Focus existente
- [ ] Ambos quedan `resolved` en la lista tras el fix
- [ ] Elementos ocultos (visible=off) NO generan issues, incluso si sus hijos son "visibles"

### Anotaciones en canvas
- [ ] Dots de issues: esquina superior derecha, color por severidad; números de 3 dígitos se leen en una sola línea (píldora)
- [ ] Tab Order: al asignar números aparecen cuadrados morados (esquina superior izquierda) + línea punteada trazando el recorrido; "Clear" los borra
- [ ] Alt Text: "Scan selection" con nada seleccionado da error claro; "Scan entire page" lista las imágenes; seleccionar una en la lista la selecciona en el canvas
- [ ] "Approve & assign" guarda (chip ALT verde en el canvas) y avanza a la siguiente pendiente
- [ ] Cerrar y reabrir el plugin + "Scan entire page" → la imagen asignada aparece como `ALT ✓` (persistencia via plugin data)
- [ ] Re-escanear con overlays presentes NO genera issues sobre los frames `[a11y-…]`
- [ ] El botón **? Legend** explica las tres familias de anotaciones y el setup de Ollama

### Ollama (alt text con IA)
- [ ] Con Ollama corriendo (`OLLAMA_ORIGINS="*"`), Settings muestra 🟢 Connected y el modelo
- [ ] "Generate" sobre una imagen produce texto en streaming (primera vez ~30s por carga del modelo)
- [ ] Con Ollama apagado, "Generate" muestra el error con la instrucción de arranque (no cuelga)
