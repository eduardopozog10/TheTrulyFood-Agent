# Arquitectura de la Fase 1

## Estructura implementada

```text
web/                       HTML, CSS y TypeScript del chat responsive
src/api.ts                 Rutas Fastify, entradas, límites y seguridad HTTP
src/server.ts              Composición de dependencias y escucha local
src/config.ts              Configuración validada y tiendas autorizadas
src/domain.ts              Contratos de productos, stock, carritos y errores
src/agent/engine.ts         Contexto por conversación y bucle acotado de herramientas
src/agent/tools.ts          Contratos Zod, esquemas JSON y ejecución backend
src/llm/provider.ts         LLMProvider, intención estructurada y consumo
src/llm/simulated.ts        Planificador determinista sin API
src/llm/openai.ts           Adaptador opcional de Responses API
src/llm/pricing.ts          Tarifas independientes y estimación conservadora
src/shopify/http.ts         Transporte HTTPS de lectura, DNS fijado y límites
src/shopify/catalog.ts      Catálogo público, normalización, variantes y carrito
src/shopify/demo.ts         Catálogo ficticio aislado
src/commercial/validate.ts  Validación comercial y redacción final controlada
src/storage/journal.ts     Bitácora JSONL con redacción y retención
config/model-pricing.json  Tarifas revisadas por modelo; vacío por defecto
tests/                     Pruebas offline con transporte y proveedor inyectables
scripts/                   Copia de assets, diagnóstico público y revisión de staging
data/                      Bitácoras locales excluidas de Git
dist/                      Salida compilada excluida de Git
```

## Flujo de conversación

1. El navegador crea una conversación con catálogo `live` o `demo`. La URL de tienda nunca es un argumento del chat.
2. La API valida JSON, origen, host, tamaño y límites. El motor elimina patrones comunes de credenciales y datos personales antes de registrar o enviar el mensaje al proveedor.
3. `LLMProvider.next` recibe historia acotada, contexto y resultados estructurados. Devuelve una herramienta o una intención cerrada, nunca prosa comercial libre.
4. `ToolRunner` valida argumentos y ejecuta hasta cuatro herramientas por turno por defecto. Cada resultado se registra con duración y errores seguros.
5. Shopify normaliza precio, moneda, identificadores y tres estados de disponibilidad. Los detalles y carritos refrescan datos; búsquedas tienen caché de 60 segundos.
6. El backend valida que toda referencia comercial pertenezca a resultados del turno. El contexto previo solo sirve para seleccionar, no para respaldar precios o stock nuevos.
7. El renderer comercial genera texto y fichas desde evidencia. El navegador presenta esa respuesta sin `innerHTML`. Las métricas reflejan mensajes guardados, herramientas y consumo acumulado.

El saludo visual inicial no cuenta como intercambio del motor. Reiniciar crea un UUID nuevo y descarta contexto y métricas activas; conserva el historial local hasta su vencimiento.

## Shopify público

- `GET /cart.js`: moneda de presentación; nunca se registran token ni cookies crudos.
- `GET /products.json?limit=50&page=N`: hasta 100 productos por consulta. Es una interfaz pública disponible en esta tienda, sin garantía de estabilidad; no se presenta como API administrativa documentada.
- `GET /products/{handle}.js`: interfaz Ajax documentada para detalles. Admite JSON con MIME `application/json`, `text/javascript` o `application/javascript`; se usa `JSON.parse`, nunca evaluación de JavaScript.
- Los strings decimales de products.json se convierten exactamente a centésimas; los enteros Ajax ya son centésimas Shopify. Ejemplo: `"49990.00"` y `4999000` corresponden al mismo valor CLP. No asumir unidades a partir del nombre del archivo.
- Solo `available: true` confirma disponibilidad publicada. No se infiere inventario cuantitativo ni reserva stock.
- Si la búsqueda cubre 100 productos completos, se identifica como parcial. Se necesita una API autorizada para cobertura completa y garantías de inventario.

Para cambiar de tienda se debe añadir una entrada revisada en `STORES`, ajustar las listas de imágenes/CSP/frontend y probar el adaptador. No se admiten dominios arbitrarios por variables de entorno ni URLs del cliente.

## Carrito y evidencia

El formato legacy `/cart/{variantId}:{quantity}?storefront=true` se trata como una hipótesis. Solo después de una solicitud explícita del cliente y una selección conocida se consulta el detalle actualizado. Se requiere variante disponible, moneda y precio válidos.

La validación utiliza una sesión aislada de visitante: lee el permalink, sigue como máximo redirecciones al `/cart` del mismo dominio, mantiene cookies solo en memoria durante esa operación y vuelve a leer `/cart.js`. Exige un único ítem con variante, cantidad, precio y moneda concordantes. Un HTTP 200 o 302 por sí solo **no valida** el enlace. Nunca se sigue checkout ni se llama a pagos, pedidos, Admin API o `POST /cart/add.js`.

Si la prueba es incompleta, el resultado es `unverified`, URL de carrito nula y enlace de producto oficial. La demostración nunca produce enlaces de compra reales. Este procedimiento no verifica pago, despacho, precio futuro ni reserva de stock. No se ofrecen suscripciones a través de permalinks.

Shopify documenta actualmente los permalinks legacy y su sucesor UCP; esta fase mantiene el mecanismo acotado solicitado y no descubre ni sigue dominios UCP externos. Una futura integración autorizada debe evaluar Storefront Cart API y capacidades vigentes.

## Proveedores

`SimulatedProvider` usa reglas para búsqueda, selección ordinal, detalle, stock, variantes, carrito y respuestas de limitación. No pretende comprender español libre con la calidad de un LLM. Separar proveedor simulado de catálogo ficticio: puede consultar datos reales sin consumir API de IA.

`OpenAIProvider` usa el endpoint oficial `POST https://api.openai.com/v1/responses`, funciones estrictas y un esquema de intención. Cada solicitud es una planificación independiente con historia y resultados tipados dentro del contexto; no usa `previous_response_id` ni almacenamiento remoto de Responses (`store=false`). Las instrucciones de catálogo se tratan como datos no confiables. El backend vuelve a validar, aunque el proveedor respete el esquema.

El modelo no tiene identificador por defecto. Activar requiere clave, modelo vigente y `OPENAI_ALLOW_PAID=true`. No hay reintentos automáticos. Entrada limitada a 64 000 caracteres, salida a 600 tokens y respuesta a 128 KB, timeout de 20 segundos por llamada. La integración se prueba con fetch simulado; no se llamó a la API pagada.

## Persistencia y costos

El estado activo vive en memoria: hasta 200 conversaciones, 60 turnos por conversación y una operación simultánea por conversación. Se limpia contexto inactivo después de 24 horas al crear conversaciones. Un reinicio de proceso no rehidrata sesiones: los JSONL quedan para diagnóstico, no como historial navegable.

Cada JSONL registra UUID, fecha UTC, proveedor, modelo, mensajes redactados, herramientas, duración, consumo y errores. Retención predeterminada de siete días al iniciar y cada hora. No registra cookies, headers de autorización ni respuestas HTTP crudas.

El simulador registra cero tokens y cero USD. OpenAI registra tokens informados por la API. Una llamada fallida deja consumo/costo desconocidos; la suma conserva esa incertidumbre. Tarifas por millón de tokens se configuran aparte con URL oficial y fecha vigente de hasta 30 días. La estimación aplica la tarifa de entrada a todos los tokens de entrada: no presupone descuentos de caché, impuestos ni facturación final. Sin tarifa vigente, costo desconocido.

## Decisiones y evolución

Fastify aporta HTTP, inyección de solicitudes para pruebas y límites; Zod unifica validación y esquemas. Frontend nativo y compilación con TypeScript evitan un segundo servidor y frameworks de agentes. `node:test` evita dependencias de pruebas innecesarias. `tsx` solo se usa en desarrollo y diagnóstico.

`Catalog`, `LLMProvider` y `Journal` permiten añadir Shopify autenticado, otros modelos y PostgreSQL sin acoplarlos al chat. WhatsApp será otro adaptador de entrada/salida del motor; requerirá identidad, webhooks, idempotencia y traspaso humano reales en su fase correspondiente.

## Referencias oficiales revisadas

- [Shopify Ajax Product API](https://shopify.dev/docs/api/ajax/reference/product)
- [Shopify cart permalinks y limitaciones](https://shopify.dev/docs/apps/build/checkout/create-cart-permalinks)
- [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [OpenAI Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create)
- [Fastify](https://fastify.dev/)
