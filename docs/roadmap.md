# Evolución del agente comercial

## Fase 1 — Prototipo local (implementada; ver evidencia)

Chat local Windows, catálogo público Shopify, fixtures etiquetados, cuatro herramientas comerciales, proveedores intercambiables, validación backend, bitácora y métricas. Ver `verification.md` para distinguir ejecución real, mocks y pendientes. Entrega mediante PR, sin merge automático.

## Fase 2 — Evaluación y mejora conversacional

Requiere una muestra ficticia de consultas comerciales chilenas, criterios acordados y un presupuesto API explícito antes de activar modelos reales. Elegir identificadores vigentes y tarifas oficiales. Comparar calidad de búsqueda, selección de variantes, contexto, abstención, latencia y costo. Medir errores comerciales y ataques de prompt injection. El simulador no mide calidad de un modelo.

Mantener precios, stock y enlaces en herramientas. Cualquier ampliación a texto libre exige evaluaciones y validación de afirmaciones. Diseñar métricas de oportunidad de venta y derivación sin afirmar conversiones no observadas. Definir criterios de aceptación antes del experimento y un límite de gasto.

## Fase 3 — WhatsApp oficial y traspaso humano

WhatsApp Cloud API autorizada, recepción y envío de mensajes, firmas, idempotencia, políticas y ventanas de mensajería vigentes, consentimiento y opt-out. Evaluar coexistencia con los canales existentes. Implementar cola o mecanismo justificado según carga, estado de atención, responsables, horario y traspaso humano verificable. No simular que alguien recibió una derivación.

## Fase 4 — Shopify autorizado de The Truly Food

Acceso autorizado con permisos mínimos, Storefront/Admin API según necesidad y fuente de verdad para productos, precios, inventario, carritos, checkout, pedidos y planes de suscripción. Validar zona, despacho, contexto de moneda y disponibilidad. Revisar capacidades y límites de carritos/planes vigentes. Mantener pagos en checkout oficial; no manipular tarjetas. Probar primero en entorno autorizado sin operaciones de producción.

## Fase 5 — Administración y optimización comercial

Panel administrativo con autenticación y roles, PostgreSQL cuando exista necesidad, oportunidades, conversiones verificadas por eventos autorizados, costos por conversación, calidad, embudos, experimentos y auditoría. Política formal de retención, seguridad y privacidad. Aprobar infraestructura y presupuesto antes de contratar o desplegar.
