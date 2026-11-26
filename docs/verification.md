# Evidencia de verificación — Fase 1

Fecha: **26 de noviembre de 2026**, America/Santiago. Usar estas etiquetas para distinguir pruebas offline, datos externos y funcionalidades pendientes. Los datos de Shopify son una fotografía temporal, no valores fijos.

## Verificación de tipos

**VERIFICADO:** `npm run typecheck` completa sin errores para backend, frontend, scripts y pruebas con TypeScript estricto. Entorno de ejecución de esta entrega: Windows, Node.js 26.13.0 y npm 11.20.0. Requisito documentado: Node 24.12+; no se ejecutó otra versión de Node durante esta sesión.

## Pruebas automatizadas

**VERIFICADO:** `npm test` ejecuta **41 pruebas**, sin fallas, todas offline. `fetch` de OpenAI y el transporte Shopify están simulados; no se usa la tienda real ni una clave API en la suite.

| Requisito solicitado | Evidencia reproducible | Estado |
| --- | --- | --- |
| 1. Consultar productos | Consulta de catálogo, normalización y caché | VERIFICADO |
| 2. Productos inexistentes | Lista vacía y abstención de recomendaciones | VERIFICADO |
| 3. Productos agotados | Estado `sold_out`, sin intento de carrito | VERIFICADO |
| 4. Stock desconocido | `available` ausente produce `unknown` | VERIFICADO |
| 5. Variantes | IDs seguros, pertenencia y detalle actualizado | VERIFICADO |
| 6. Precios | Decimales exactos, centésimas Ajax, datos inválidos y moneda ausente | VERIFICADO |
| 7. Identificadores | IDs cero, inseguros, no decimales y handles maliciosos | VERIFICADO |
| 8. Enlaces de carrito | Sesión aislada y concordancia; variantes, cantidades, monedas y precios discordantes se rechazan | VERIFICADO con mocks; tienda real no verificada |
| 9. Precios inventados | Contrato estricto rechaza campos de precio del proveedor | VERIFICADO |
| 10. Promociones inventadas | Campos libres rechazados y respuesta sin descuentos supuestos | VERIFICADO |
| 11. Errores de Shopify | 403/404, HTML, JSON inválido, red y pausa tras bloqueo | VERIFICADO |
| 12. Errores de IA | HTTP, red, JSON inválido, herramientas inválidas, salida excesiva e incompleta | VERIFICADO con mocks |
| 13. Límites | Herramientas por turno, tiempo, concurrencia, API por minuto y contexto excesivo | VERIFICADO |
| 14. Reiniciar conversación | UUID nuevo, contexto limpio, sesión anterior inválida | VERIFICADO |
| 15. Consumo y costos | Cero simulado, tokens acumulados, tarifa vigente, tarifa caducada y costo desconocido | VERIFICADO |
| 16. URLs permitidas | Origen/rutas exactas y bloqueo de red privada/IPv6 | VERIFICADO |
| 17. Secretos | Configuración pública por whitelist, errores seguros, redacción y rutas privadas no servidas | VERIFICADO |
| 18. Chat local | API inyectada y flujos interactivos en navegador local | VERIFICADO |

Se agregaron regresiones al descubrir MIME `text/javascript` en Ajax y la ambigüedad entre un ID ficticio de nueve dígitos y un teléfono chileno. Los IDs de la demostración tienen ahora longitud diferenciada. El parser acepta JSON puro con MIME JavaScript, pero rechaza ejecución y JSONP.

En el aislamiento de herramientas, `tsx` encontró una restricción de lectura del perfil Windows (`uv_os_get_passwd`). La suite se ejecutó fuera de ese aislamiento con autorización de ejecución local; no se cambió la seguridad del computador ni el código para evadirla.

## Compilación

**VERIFICADO:** `npm run build` genera backend en `dist/` y frontend en `dist/web/`. Se inició el compilado con `node --env-file-if-exists=.env dist/server.js` escuchando solo en `127.0.0.1:3000`. `dist/` no se versiona.

## Dependencias

**VERIFICADO:** `npm audit --audit-level=low` informó **0 vulnerabilidades** en la revisión de esta entrega. Versiones directas: Fastify 5.12.8, Zod 4.6.7, TypeScript 7.0.2, tsx 4.23.15 y @types/node 26.6.11. El lockfile permite reinstalación reproducible. Una auditoría es una fotografía del registro, no una garantía permanente.

## Shopify real

**VERIFICADO:** `npm run probe:shopify -- --cart` consultó las interfaces públicas con el adaptador Node, sin credenciales de tienda, sin pagos ni pedidos. La lectura de catálogo y detalle finalizó correctamente hacia las **11:51 de Santiago** (14:51 UTC).

| Dato | Valor observado | Fuente |
| --- | --- | --- |
| Producto | GORRA DE GAMUZA | products.json y producto Ajax |
| Handle | `gorra-de-gamuza-gautier` | Catálogo público |
| Variante | `43201464139985` | Detalle actualizado |
| Precio | $49.990 CLP | Precio publicado y moneda de cart.js |
| Disponibilidad | `available: true` | Vitrina pública; sin cantidad de inventario |
| URL oficial | [Producto en Gautier](https://gautieroficial.cl/products/gorra-de-gamuza-gautier) | Origen autorizado |
| Carrito | `unverified`, URL de carrito nula | Comprobación conservadora; solo se entrega URL de producto |

La primera consulta mediante PowerShell recibió 403. Las solicitudes normales del adaptador Node sí entregaron datos públicos. No se resolvieron desafíos, no se reutilizaron sesiones de navegador, no se desactivó TLS ni se intentó acceso privado. No se modificó la tienda administrativa ni se completó ninguna compra. Las restricciones pueden variar en otras sesiones; el modo demo permite continuar sin insistir.

**PENDIENTE:** comprobar un carrito real que satisfaga toda la evidencia exigida. La implementación de la rama verificada se probó con mocks; un HTTP exitoso no se equipara a carrito validado. Los permisos y el acceso público futuros de la tienda no están garantizados.

## Navegador local

**VERIFICADO:** interfaz cargada en el navegador, envío mediante sugerencias, mensajes de error del catálogo real inicial, cambio a demostración, búsqueda de gorra, fichas con variantes y disponibilidad, botón de carrito ficticio, costo cero y reinicio con métricas a cero. Se revisaron tamaños móvil y escritorio. No se usaron datos personales reales.

La inspección posterior al ajuste de MIME confirma catálogo real desde el chat y el enlace oficial del producto. Los registros y archivos temporales de estas comprobaciones están ignorados por Git.

## GitHub y costos

**VERIFICADO:** cuenta identificada mediante complemento GitHub: `eduardopozog10`. El complemento no expone creación de repositorios y no pudo acceder al repositorio nuevo. Se creó mediante API oficial autenticada por Git Credential Manager, comprobando coincidencia de cuenta y `private: true`. El remoto local es exclusivamente el repositorio de este proyecto.

La entrega usa `feature/fase-1-prototipo` y PR hacia `main`, sin merge automático. La URL del PR y el SHA final se informan en la entrega y en los metadatos de Git para no incluir un hash autorreferencial en este documento.

**VERIFICADO:** cero llamadas pagadas a OpenAI, cero servicios contratados, cero despliegues públicos y ningún workflow Actions activado por este proyecto. Gasto incremental en API y servicios externos de esta implementación: **US$0**. No se atribuye aquí un costo a tu suscripción existente o al uso de Codex.

**ESTIMACIÓN:** costos futuros de modelos se calcularán por tokens y tarifas verificadas; no hay una cifra asumida ni un presupuesto futuro autorizado.

**PENDIENTE:** evaluación de un modelo real, WhatsApp, derivación humana operativa, Shopify autorizado de The Truly Food, pedidos, suscripciones, despacho verificable, oportunidades y conversiones. Corresponden a Fases 2–5.
