import type { Key } from "~lib/i18n/en"

// Spanish. Same keys as `en.ts` (the type makes a missing or extra key a
// compile error). Some texts are matched by the real-browser test scripts.
export const es: Record<Key, string> = {
  // header and tabs
  "tab.related": "Relacionados",
  "tab.saved": "Guardados",
  "tab.updates": "Novedades",
  "tab.settings": "Ajustes",
  "tab.settings.hint":
    "Ajustes: tu clave de Semantic Scholar, el idioma y información sobre la app",
  "tab.related.hint":
    "Papers relacionados con el artículo que tienes abierto, o con un tema que busques",
  "tab.saved.hint":
    "Los papers que guardaste, con estado de lectura, notas y colecciones",
  "tab.updates.hint":
    "Papers nuevos relacionados con lo que guardaste, revisados solos una vez al día",
  "updates.unseen": "Novedades sin ver",

  // language
  "lang.title": "Idioma",
  "lang.auto": "Automático",
  "lang.es": "Español",
  "lang.en": "English",
  "lang.hint": "El idioma de la interfaz de NextPaper",

  // search and navigation
  "search.placeholder": "Buscar artículos por tema",
  "search.button": "Buscar",
  "search.hint":
    "Encuentra y agrupa papers sobre un tema, sin necesidad de tener un artículo abierto",
  "context.open": "Paper abierto",
  "context.exploring": "Explorando",
  "context.topic": "Tema",
  "citedBy.title": "Cómo lo citan",
  "citedBy.hint":
    "Frases de los papers que citan a este, donde Semantic Scholar encontró la cita. Primero se muestran solo las que nombran a este paper por su autor o su título.",
  "citedBy.loading": "Buscando las frases...",
  "citedBy.error": "No se pudieron cargar las frases.",
  "citedBy.none": "Semantic Scholar no tiene frases de citas para este paper.",
  "citedBy.noNamed": "Ninguna frase nombra a este paper por su autor o título.",
  "citedBy.summary":
    "Frases encontradas en {n} de {total} papers que lo citan.",
  "citedBy.influential": "Influyente",
  "citedBy.influential.hint":
    "Semantic Scholar marca esta cita como influyente",
  "citedBy.onlyInfluential": "Solo influyentes",
  "citedBy.more": "Ver {n} más",
  "citedBy.others": "Ver {n} que no nombran al paper",
  "citedBy.others.hide": "Ocultarlas",
  "citedBy.others.note":
    "Semantic Scholar asoció estas frases al paper, pero no mencionan a sus autores ni su título, así que pueden ser sobre otra referencia cercana.",
  "citedBy.source":
    "Las frases se extraen automáticamente del texto completo de los papers que lo citan y pueden contener errores.",
  back: "← Volver",
  "back.hint": "Volver al análisis anterior",
  detecting: "Detectando paper...",
  noPaper:
    "No se detectó ningún paper en esta página. Abre un artículo en PubMed, arXiv, bioRxiv, PMC o la web de cualquier editorial que publique el DOI en sus metadatos, o busca un tema arriba.",

  // analysis progress and errors
  "step.default": "Buscando papers relacionados...",
  "step.reading": "Leyendo el paper...",
  "step.gathering": "Reuniendo referencias, citas y recomendaciones...",
  "step.scoring": "Calculando similitud de {n} candidatos...",
  "step.searching": "Buscando papers sobre el tema...",
  "step.analyzing": "Analizando {n} resultados...",
  runsInBackground: "Corre en segundo plano: puedes cerrar el popup y volver.",
  loadingResults: "Cargando resultados...",
  noResults: "No se encontraron papers relacionados.",
  retry: "Reintentar",
  "error.rate_limited":
    "Semantic Scholar está limitando las peticiones. Vuelve a intentarlo en un momento.",
  "error.not_found": "Este paper no está indexado en Semantic Scholar todavía.",
  "error.key_rejected":
    "Semantic Scholar ha rechazado tu clave de API. Revísala en Ajustes o quítala para usar NextPaper sin clave.",
  "error.storage_full":
    "No hay espacio suficiente en el almacenamiento de la extensión.",
  "error.unavailable": "No se pudo conectar con Semantic Scholar.",
  "error.no_data": "No se pudieron obtener los datos de las novedades.",
  "error.unknown": "Algo ha salido mal.",
  "error.noKeyHint":
    "Sin clave propia, Semantic Scholar limita más las peticiones.",
  "error.addKey": "Añade la tuya en Ajustes",

  // filters, sorting, list
  "filter.all": "Todos",
  "filter.reference": "Referencias",
  "filter.citation": "Lo citan",
  "filter.review": "Revisiones",
  "filter.open": "PDF libre",
  "filter.all.hint": "Mostrar todos los resultados",
  "filter.reference.hint":
    "Papers que el que estás leyendo cita (su bibliografía)",
  "filter.citation.hint": "Papers que citan al que estás leyendo",
  "filter.review.hint": "Revisiones de la literatura y metaanálisis",
  "filter.open.hint": "Papers con el texto completo disponible gratis",
  "design.label": "Diseño",
  "design.all": "Todos",
  "design.hint":
    "Diseño detectado con reglas en el título y el abstract; filtra por tipo de estudio. Puede fallar",
  "filters.more": "Más filtros",
  "filters.year": "Año",
  "filters.year.from": "Desde",
  "filters.year.to": "Hasta",
  "filters.last5": "Últimos 5 años",
  "filters.last10": "Últimos 10 años",
  "filters.minCitations": "Mín. citas",
  "filters.minCitations.any": "Cualquiera",
  "filters.minCitations.n": "{n}+",
  "filters.noYear":
    "Los papers sin año quedan fuera mientras hay un año fijado, porque no sabemos dónde caen.",
  "filters.clear": "Quitar filtros",
  "sort.label": "Ordenar",
  "sort.hint": "Orden de los resultados",
  "sort.relevance": "Relevancia",
  "sort.citations": "Más citados",
  "sort.year": "Más recientes",
  citeAs: "Citar como",
  "citeAs.hint": "El estilo de cita que se usa al copiar o exportar citas",
  count: "{shown} de {total} papers",
  "timeline.label": "Cronología",
  "timeline.hint":
    "Un gráfico con una fila por subtema y cada paper colocado por año (punto más grande = más citado). Muestra qué líneas de trabajo son clásicas y cuáles recientes.",
  noneMatch: "Ningún paper cumple este filtro.",
  "picks.title": "Empieza por aquí",
  "picks.hint":
    "Tres formas de entrar en un tema que no conoces: un clásico, la revisión más relevante y lo más reciente",
  "pick.foundational": "Clásico para empezar",
  "pick.review": "Revisión relevante",
  "pick.recent": "Lo más reciente",
  "group.related": "Relacionados",
  "group.all": "Todos",
  "group.n": "Grupo {n}",
  "group.hint": "Papers agrupados por similitud de contenido (subtemas)",

  // copy and export
  copyCitations_one: "Copiar {n} cita",
  copyCitations_other: "Copiar {n} citas",
  "copyCitations.hint":
    "Copia las citas de los papers mostrados, en el estilo elegido",
  "copy.preparing": "Preparando...",
  "copy.progress": "Preparando {done}/{total}",
  "copy.ready": "Pulsa para copiar",
  "copy.copied": "Copiado",
  "export.bib.hint":
    "Descarga los papers mostrados como archivo .bib (Zotero, Mendeley, LaTeX)",
  "export.ris.hint":
    "Descarga los papers mostrados como archivo .ris (Zotero, Mendeley, EndNote)",

  // paper card
  "card.save": "Guardar para leer después",
  "card.unsave": "Quitar de guardados",
  "card.noYear": "s.f.",
  "card.tldr.hint":
    "Resumen de una frase generado automáticamente por Semantic Scholar",
  "card.abstract.show": "Ver abstract",
  "card.abstract.hide": "Ocultar abstract",
  "card.citations_one": "{n} cita",
  "card.citations_other": "{n} citas",
  "card.citations.hint": "Cuántos papers citan a este",
  "card.influential": "{n} citas influyentes",
  "card.similar": "{n}% similar",
  "card.similar.hint":
    "Cuánto se parece su contenido al paper que lees (similitud coseno entre embeddings SPECTER2)",
  "card.similar.approx.hint":
    "Aproximada: el paper que lees no tiene embedding, se compara con sus vecinos más probables",
  "card.relation.reference": "Referencia",
  "card.relation.reference.hint": "El paper que lees cita a este",
  "card.relation.citation": "Lo cita",
  "card.relation.citation.hint": "Este paper cita al que lees",
  "card.review": "Revisión",
  "card.review.hint": "Una revisión de la literatura o un metaanálisis",
  "card.design.hint":
    "Diseño detectado en el título y el abstract con reglas; puede fallar",
  "card.sample.hint":
    "Tamaño de muestra leído del abstract con reglas; puede fallar",
  "card.sample.studies_one": "{n} estudio",
  "card.sample.studies_other": "{n} estudios",
  "card.explore": "Explorar",
  "card.explore.hint":
    "Analizar este paper: ver sus referencias, citas y papers similares",
  "card.pdf": "PDF gratis",
  "card.pdf.hint": "Abrir el texto completo gratuito",
  "card.inText": "En texto",
  "card.inText.hint": "Copiar la cita en el texto, p. ej. (Autor, 2020)",
  "card.cite": "Citar",
  "card.cite.hint": "Copiar la referencia en el estilo de cita elegido",

  // reading status
  "status.unread": "Por leer",
  "status.reading": "Leyendo",
  "status.read": "✓ Leído",
  "status.read.plain": "Leído",

  // study design (chips and filter)
  "design.protocol": "Protocolo de estudio",
  "design.meta": "Metaanálisis",
  "design.systematic": "Revisión sistemática",
  "design.rct": "Ensayo aleatorizado",
  "design.trial": "Ensayo clínico",
  "design.psychometric": "Validación psicométrica",
  "design.experimental": "Experimental / piloto",
  "design.review": "Revisión",
  "design.case-control": "Casos y controles",
  "design.cohort": "Cohortes / longitudinal",
  "design.mixed": "Métodos mixtos",
  "design.cross-sectional": "Transversal / encuesta",
  "design.qualitative": "Cualitativo",
  "design.case": "Caso clínico",

  // citation styles
  "style.apa": "APA 7",
  "style.mla": "MLA 9",
  "style.chicago": "Chicago (autor-fecha)",
  "style.harvard": "Harvard",
  "style.ieee": "IEEE",
  "style.vancouver": "Vancouver",
  "style.ama": "AMA",
  "style.bibtex": "BibTeX",
  "style.ris": "RIS (Zotero, Mendeley)",

  // saved tab
  "saved.empty":
    "Aún no has guardado nada. Pulsa la ☆ de cualquier paper para guardarlo aquí, o importa tus referencias desde otra herramienta.",
  "saved.status.all": "Todos",
  "saved.search": "Buscar en tu biblioteca",
  "saved.collections.all": "Todas las colecciones",
  "saved.collection.delete": "Eliminar colección",
  "saved.collection.delete.hint":
    "Quita la colección de todos los papers; los papers se conservan",
  "saved.none": "Ningún paper guardado con este filtro.",
  "item.note.hide": "Ocultar nota",
  "item.note.view": "Ver nota",
  "item.note.add": "Añadir nota",
  "item.note.placeholder": "Por qué es relevante, qué citar de aquí, dudas...",
  "item.collection.add": "+ colección",
  "item.collection.hint":
    "Agrupa papers en colecciones, p. ej. una por capítulo de la tesis",
  "item.collection.remove": "Quitar de {name}",

  // backup and import
  "tools.backup": "Copia de seguridad",
  "tools.backup.hint":
    "Descarga todos tus papers guardados, notas y colecciones en un archivo",
  "tools.import": "Importar...",
  "tools.import.hint":
    "Restaurar una copia de NextPaper, o importar un .bib, .ris o una lista de DOI",
  "tools.reading": "Leyendo archivo...",
  "tools.step.dois": "Buscando {n} DOI...",
  "tools.step.titles": "Buscando {n} títulos...",
  "tools.backupDone": "Copia de seguridad guardada ({papers}).",
  "tools.restored": "Copia restaurada: {added}",
  "tools.imported": "Importados {papers} en la colección «{collection}»",
  "tools.collectionName": "Importados",
  "tools.alreadySaved": "{n} ya estaban guardados",
  "tools.notFound": "{n} no se encontraron",
  "tools.skipped": "{n} títulos sin buscar (máximo 25 por archivo)",
  "tools.noRefs":
    "No se encontraron referencias (DOI o títulos) en el archivo.",
  "tools.failed": "No se pudo importar el archivo.",
  papers_one: "{n} paper",
  papers_other: "{n} papers",
  newPapers_one: "{n} paper nuevo",
  newPapers_other: "{n} papers nuevos",
  updatedPapers_one: "{n} actualizado",
  updatedPapers_other: "{n} actualizados",

  // updates tab
  "updates.title": "Novedades para ti",
  "updates.check": "Buscar ahora",
  "updates.checking": "Buscando...",
  "updates.check.hint":
    "Busca ahora papers nuevos relacionados con lo que guardaste",
  "updates.description":
    "Papers nuevos relacionados con lo que guardaste. Se revisa solo cada 24 h",
  "updates.lastChecked": " (última vez {ago})",
  "updates.error":
    "La última comprobación falló: {error} Se reintentará sola; también puedes pulsar «Buscar ahora».",
  "updates.nothing": "Nada nuevo por ahora.",
  "updates.notChecked": "Aún no se ha comprobado. Pulsa «Buscar ahora».",
  "updates.noSaved":
    "Guarda algunos papers con la ☆ y NextPaper buscará aquí papers nuevos relacionados.",
  "updates.because": "Porque guardaste: {title}",
  "updates.new": "Nuevo",
  "updates.dismiss": "Descartar",
  "updates.clear": "Borrar todo",
  "updates.clear.hint":
    "Quita todas las novedades de la lista. No se volverán a sugerir.",
  "ago.now": "hace un momento",
  "ago.minutes": "hace {n} min",
  "ago.hours": "hace {n} h",
  "ago.days": "hace {n} d",

  // timeline chart
  "timeline.aria": "Cronología de los papers por subtema",
  "timeline.you": "★ tu paper ({year})",
  "timeline.tooltip": "{title} ({year}) · {citations}",
  "timeline.median": "mediana {year}",
  "timeline.undated": "{n} sin año no aparecen.",
  "timeline.legend":
    "Cada punto es un paper (más grande = más citado). Pulsa un punto para ir a su tarjeta.",

  // first-run setup and settings
  "setup.title": "Bienvenido a NextPaper",
  "setup.subtitle": "Configuración inicial · solo la primera vez",
  "settings.title": "Ajustes",
  "settings.close": "Cerrar",
  "setup.intro":
    "NextPaper busca literatura relacionada con lo que lees usando **Semantic Scholar**, una base de datos científica abierta y gratuita. Para funcionar bien necesita **tu propia clave de acceso**, que es gratis.",
  "settings.keyStatus": "Clave de Semantic Scholar: {status}",
  "settings.key.saved": "guardada ({masked})",
  "settings.key.none": "sin clave (modo lento)",
  "why.title": "¿Por qué una clave propia?",
  "why.fast":
    "**Va más rápido.** Sin clave, el primer análisis de un paper puede tardar unos 20 segundos en vez de unos 5, y falla más.",
  "why.private":
    "**Es privada.** Se guarda solo en este navegador y solo se envía a Semantic Scholar.",
  "why.yours":
    "**Es tuya.** Cada persona usa la suya, así NextPaper no depende de un servidor ni de un límite compartido con otros.",
  step1:
    "**Pide tu clave gratis** en la web de Semantic Scholar. Rellena el formulario y te la enviarán por **correo electrónico**.",
  "step1.button": "Abrir el formulario de Semantic Scholar ↗",
  step2:
    "**Copia la clave** del correo: es un texto largo de letras y números. No la compartas con nadie.",
  step3: "**Pégala aquí** y pulsa Guardar.",
  "key.placeholder": "Pega aquí tu clave",
  "key.label": "Clave de API de Semantic Scholar",
  "key.saveFirst": "Guardar y empezar",
  "key.save": "Guardar clave",
  "key.checking": "Comprobando...",
  "key.remove": "Quitar clave",
  "key.msg.notKey":
    "Eso no parece una clave. Es un texto de unas 40 letras y números, sin espacios. Cópiala entera del correo de Semantic Scholar.",
  "key.msg.refused":
    "Semantic Scholar no acepta esa clave. Comprueba que la copiaste completa y sin espacios.",
  "key.msg.saved": "Clave guardada y comprobada ✓",
  "key.msg.savedUnchecked":
    "Clave guardada, pero ahora no he podido comprobarla (Semantic Scholar está ocupado). Si algo falla, revísala aquí.",
  "key.msg.removed":
    "Clave quitada. NextPaper funcionará sin clave (más lento).",
  "setup.skipHint":
    "¿No quieres pedir una clave ahora? Puedes empezar sin ella y añadirla más tarde en Ajustes.",
  "setup.skip": "Continuar sin clave (más lento)",
  "about.dataPrefix": "Datos de ",
  "about.dataAnd": " (Allen Institute for AI) y ",
  "about.local":
    "Tu biblioteca, notas y clave se guardan solo en este navegador. NextPaper no usa cuentas, servidores ni analítica.",
  "about.license": "Software libre (licencia MIT) · versión {version}"
}
