# The Truly Food · Agente comercial

Prototipo local de la **Fase 1**: conversar desde el navegador, explorar un catálogo Shopify y validar herramientas comerciales antes de integrar canales reales. Funciona en Windows con un único backend TypeScript. El proveedor simulado no consume API de IA y es la opción predeterminada.

**Repositorio privado:** [eduardopozog10/TheTrulyFood-Agent](https://github.com/eduardopozog10/TheTrulyFood-Agent). Desarrollo en `feature/fase-1-prototipo`; entrega mediante Pull Request hacia `main`, sin merge automático.

## Qué funciona

- Chat responsive con estado de procesamiento, errores, nueva conversación y selección de catálogo.
- Búsqueda de productos por nombre, descripción y categoría; detalle, variantes, precios, moneda y disponibilidad publicada.
- Cuatro herramientas backend: `buscar_productos`, `detalle_producto`, `consultar_disponibilidad` y `crear_carrito`.
- Datos reales de **Gautier**, una tienda de prueba independiente de The Truly Food, y catálogo **ficticio** para pruebas sin red. La UI diferencia ambas fuentes.
- Precio y stock respaldados por herramientas; el modelo no escribe precios, promociones ni enlaces libres. Stock ausente se muestra como desconocido.
- Enlace de carrito solo si una comprobación aislada verifica variante, cantidad, precio y moneda; de lo contrario se muestra el producto oficial. Los fixtures nunca generan enlaces de compra.
- `LLMProvider` intercambiable: simulador determinista y adaptador opcional de OpenAI Responses API, desactivado por defecto.
- Bitácoras JSONL locales, consumo, tokens y costo estimado. El simulador registra cero; sin tarifa vigente se informa costo desconocido.
- Pruebas reproducibles offline con fixtures, incluyendo errores, límites, seguridad y validación comercial.

**VERIFICADO el 26 de noviembre de 2026:** catálogo y detalle reales de la gorra de gamuza de Gautier, $49.990 CLP y disponibilidad publicada. El carrito real quedó **no verificado**, por lo que se entrega solo el enlace de producto. Los datos pueden cambiar; no están fijados en el código. Ver [evidencia completa](docs/verification.md).

## Tecnologías

Node.js 24.12+ (validado aquí con Node 26.13.0), TypeScript estricto, Fastify, Zod, frontend nativo y `node:test`. `tsx` se usa solo en desarrollo. Sin Redis, microservicios, base externa ni framework pesado de agentes. Las versiones exactas y dependencias transitivas están en `package-lock.json`.

## Inicio en Windows y PowerShell

Necesitas Node.js 24.12 o superior y Git. Abre esta carpeta desde **VS Code → Archivo → Abrir carpeta**, y luego **Terminal → Nueva terminal → PowerShell**. Para clonar en otro computador, autentica GitHub con una cuenta que tenga acceso al repositorio privado y selecciona la rama de la entrega:

```powershell
git clone https://github.com/eduardopozog10/TheTrulyFood-Agent.git
Set-Location TheTrulyFood-Agent
git switch feature/fase-1-prototipo
```

En la carpeta del proyecto:

```powershell
node --version
npm.cmd ci
# Copiar solo si todavía no tienes configuración propia:
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm.cmd run dev
```

Abre [http://127.0.0.1:3000](http://127.0.0.1:3000). Para detener el proceso iniciado en terminal, presiona **Ctrl+C**. Se escucha únicamente en loopback. `npm.cmd` evita depender de la política de ejecución de scripts PowerShell; no necesitas cambiarla globalmente.

Prueba **Ver catálogo**, **Busco una gorra**, **Detalle de la primera**, **¿Está disponible?** y el botón **Preparar carrito**. Para probar agotados y stock desconocido, selecciona **Demostración · datos ficticios**. Cambiar catálogo inicia otra conversación y reinicia el contexto.

En VS Code también están las tareas **Fase 1: verificar** y **Fase 1: iniciar local**, disponibles desde *Terminal → Ejecutar tarea*. No se requiere instalar extensiones de pago.

Para ejecutar el compilado:

```powershell
npm.cmd run build
npm.cmd start
```

Si el puerto 3000 está ocupado, detén tu instancia anterior o cambia `PORT` en `.env` y abre ese nuevo puerto. No expongas el servicio mediante túneles ni interfaces públicas.

## Configuración

`.env.example` documenta los valores. `.env` está excluido de Git y solo lo lee el backend.

| Variable | Predeterminado | Uso |
| --- | --- | --- |
| `PORT` | `3000` | Puerto local, 1024–65535 |
| `SHOPIFY_STORE` | `gautier` | Identificador de tienda revisado; no acepta URLs |
| `SHOPIFY_MODE` | `live` | Catálogo inicial `live` o `demo` |
| `LLM_PROVIDER` | `simulated` | Proveedor simulado u `openai` |
| `OPENAI_ALLOW_PAID` | `false` | Consentimiento local explícito para habilitar API real |
| `OPENAI_API_KEY` | vacío | Clave del backend; nunca del navegador |
| `OPENAI_MODEL` | vacío | Modelo vigente compatible con herramientas y salida estructurada |
| `DATA_DIR` | `./data` | Directorio de bitácoras locales |
| `LOG_RETENTION_DAYS` | `7` | Retención, 1–30 días |
| `MAX_TOOL_CALLS` | `4` | Herramientas por turno, 1–6 |
| `SHOPIFY_TIMEOUT_MS` | `8000` | Timeout de DNS/solicitud, 1000–15000 ms |

**Modo sin conexiones externas de catálogo:** usa `SHOPIFY_MODE=demo` y `LLM_PROVIDER=simulated`. El modo simulado también puede consultar Shopify real: proveedor de IA y fuente de catálogo son conceptos independientes.

### Preparar OpenAI para otra fase

La aplicación ya incluye el adaptador oficial. Para activarlo en el futuro deberás elegir un modelo vigente en el [catálogo oficial](https://developers.openai.com/api/docs/models), configurar una clave propia y establecer conscientemente `LLM_PROVIDER=openai` y `OPENAI_ALLOW_PAID=true`. No se presupone que tu suscripción ChatGPT incluya saldo API. La implementación y las pruebas de esta entrega no hicieron llamadas pagadas.

Las tarifas viven en `config/model-pricing.json`. La estructura por modelo exige `inputPerMillionUsd`, `outputPerMillionUsd`, `verifiedAt` y `sourceUrl` oficial. El archivo se entrega sin tarifas asumidas. Una tarifa con más de 30 días o sin verificación produce **costo desconocido**. Los costos son estimaciones de tokens, no comprobantes de facturación. Cada turno puede realizar varias llamadas acotadas: definir presupuesto antes de activar.

## Pruebas y comprobaciones

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run audit:deps
# O tipos, pruebas y compilación en secuencia:
npm.cmd run check
```

Las pruebas no necesitan Shopify ni OpenAI; usan transporte y fetch inyectados. Ver [matriz de verificación](docs/verification.md) para cobertura de los 18 requisitos. Para comprobar voluntariamente el acceso público actual:

```powershell
npm.cmd run probe:shopify
# Opcional: evaluar un carrito aislado de visitante, sin checkout ni compra:
npm.cmd run probe:shopify -- --cart
```

No repetir sondas agresivamente. Las interfaces públicas pueden devolver 403, 429, HTML, errores o formatos distintos. El adaptador no resuelve desafíos ni elude restricciones. La sonda devuelve código de error si el catálogo no se puede verificar; no hace que fallen las pruebas offline.

Antes de cada push:

```powershell
git diff --check
git add <archivos-del-proyecto>
npm.cmd run secrets:check
git diff --cached
# Tras los commits y antes de subir la rama completa:
npm.cmd run secrets:check -- --branch
```

El escáner es heurístico. No subir `.env`, `data/`, `.local/`, logs, credenciales ni dependencias. No se configura GitHub Actions automáticamente para evitar activar ejecuciones y gastos externos sin necesidad.

## Registros, privacidad y limitaciones

`data/<UUID>.jsonl` contiene mensajes redactados, herramientas, consumo y errores. El contexto activo está en memoria; reiniciar el servicio exige iniciar una conversación nueva. Las bitácoras no se restauran automáticamente en el chat. Reiniciar una conversación no borra su bitácora; la retención elimina archivos vencidos al iniciar y cada hora.

La redacción de datos personales es básica, no anonimización garantizada. Usa información ficticia. Como esta carpeta está en OneDrive, sus archivos pueden sincronizarse según tu configuración: ver [seguridad y ubicación de datos](docs/security.md).

El simulador usa reglas acotadas; sirve para comprobar flujos, no demuestra calidad de un modelo real. La salida comercial está deliberadamente controlada. La búsqueda consulta como máximo 100 productos; se indica si es parcial. La disponibilidad pública no confirma unidades ni reserva stock. No se garantiza que un enlace funcione en otra sesión o después de cambios de inventario.

No hay WhatsApp, pagos, pedidos, planes de suscripción, despacho verificado, panel de oportunidades, métricas de conversión ni derivación humana real en esta fase. No se ha integrado Shopify administrativo de The Truly Food ni probado OpenAI con una llamada pagada. No hay autenticación pública ni persistencia de contexto tras reinicios.

## Documentación y próximas fases

- [Arquitectura y decisiones](docs/architecture.md)
- [Seguridad y restricciones](docs/security.md)
- [Pruebas y evidencia](docs/verification.md)
- [Roadmap de Fases 2–5](docs/roadmap.md)
- [Instrucciones para futuros agentes](AGENTS.md)

Para comenzar Fase 2: revisar y aprobar el PR, acordar consultas ficticias y criterios de calidad, seleccionar modelos vigentes y autorizar un presupuesto explícito para la evaluación. Las integraciones reales de WhatsApp y The Truly Food corresponden a fases posteriores.
