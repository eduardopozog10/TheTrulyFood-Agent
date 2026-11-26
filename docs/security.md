# Seguridad y límites del prototipo

## Superficie y restricciones

El servicio escucha exclusivamente en `127.0.0.1`; el puerto es configurable. No activar túneles, compartir puertos ni publicarlo. No tiene autenticación: cualquier proceso o persona con acceso a la sesión local puede consultar el servicio. Se valida `Host` para reducir DNS rebinding, `Origin`/`Sec-Fetch-Site` en mutaciones y JSON como tipo de entrada. No se habilita CORS. CSP, `nosniff`, protección de frames y política sin referrer reducen la superficie del navegador.

Nunca usar credenciales de producción, WhatsApp real, datos de clientes, pagos o compras. El único estado remoto que se puede preparar es un carrito aislado de visitante cuando se solicita explícitamente. No equivale a un pedido.

## Entradas y límites

- Mensajes: 1–2000 caracteres; cuerpo HTTP hasta 8192 bytes.
- API: 30 mutaciones por IP y minuto; un turno activo por conversación.
- Conversación: 60 turnos; hasta 200 sesiones en memoria. UUID impredecible, sin enumeración de sesiones.
- Herramientas: cuatro por turno por defecto; configurable entre una y seis. Argumentos estrictos, sin propiedades extra, IDs decimales, handles acotados y cantidad 1–10.
- Presupuesto de turno: tras un minuto no se inician más iteraciones ni herramientas. Una operación ya iniciada concluye o vence con su timeout propio; no es una cancelación instantánea de solicitudes externas.
- Shopify: hasta 30 peticiones de transporte por minuto; dos páginas de 50 productos y caché de búsqueda de 60 segundos. Un bloqueo 403/429 activa un minuto sin nuevas consultas de catálogo.
- Red: DNS y solicitud con timeout configurado (8 s predeterminado); respuesta máxima 1 MB. DNS solo IPv4 público; dirección fijada al conectar manteniendo validación TLS. Sin IPv6 hasta revisión de rangos de transición.
- OpenAI: activación explícita, hasta una solicitud por iteración del bucle acotado, sin reintentos, 20 s por llamada, 64 000 caracteres de contexto, 600 tokens de salida y 128 KB de respuesta. La combinación limita trabajo, pero no constituye un presupuesto de gasto mensual.

Los límites del proceso se reinician al reiniciar el servidor; no son mecanismos de producción. Antes de habilitar IA real definir también límites de proyecto y facturación en la cuenta API.

## SSRF y contenido externo

Solo se admite `SHOPIFY_STORE=gautier`. El chat no recibe URLs ni credenciales. El transporte restringe protocolo HTTPS, origen exacto, rutas, parámetros y redirecciones. Rechaza direcciones privadas, loopback, link-local, metadata, rangos especiales y credenciales en URLs. Un resultado DNS privado bloquea la conexión antes de solicitar contenido; se evita resolver nuevamente al abrir el socket.

Las descripciones se limpian de etiquetas/scripts y se presentan como texto bajo “Descripción publicada”. No se ejecuta HTML ni JavaScript externo. Las imágenes solo se permiten desde la tienda o `cdn.shopify.com`, con CSP y sin referrer. No se descarga o ejecuta código del catálogo. Esos textos pueden ser falsos o maliciosos: su procedencia no garantiza la veracidad de características; no se convierten en instrucciones del motor.

## Guardas comerciales

La salida del proveedor contiene una intención cerrada y handles. Campos libres de precio, descuento, promoción, instrucciones o enlaces se rechazan. La respuesta se redacta con plantillas y fichas construidas con evidencia del turno. La ausencia de `available` produce estado desconocido. La falta de precio o moneda impide confirmarlo. No se infiere envío, fecha, descuento, compra, pago ni suscripción a partir de una conversación.

El carrito requiere solicitud explícita y producto previamente consultado. Con varias variantes, la opción debe estar indicada por título o ID. La validación vuelve a consultar el detalle y comprueba el carrito aislado. No se entregan enlaces no verificados ni se siguen redirecciones al checkout. La confirmación final de condiciones corresponde a la tienda cuando el usuario abre el sitio.

Estas guardas limitan las consecuencias de prompt injection; no hacen que un LLM sea infalible. El render controlado es deliberado en esta fase. Antes de permitir prosa libre generada se necesita un sistema de evaluación y validación de afirmaciones más amplio.

## Credenciales y privacidad

La clave se lee exclusivamente desde `.env`/entorno del backend. No se envía en `/api/config`, logs o respuestas de error. `.gitignore` excluye entornos, dependencias, compilados, datos, logs, certificados y archivos temporales. `npm run secrets:check` revisa staging con patrones heurísticos; `npm run secrets:check -- --branch` revisa todos los archivos de HEAD que difieren de la base con origin/main antes del push. Revisar además el diff. No garantiza descubrir cualquier secreto.

Se redactan patrones comunes de email, teléfono chileno, RUT, claves y tokens antes del registro y del uso de IA. No se solicita información personal. La redacción es básica: nombres, direcciones o formatos no reconocidos pueden persistir. Evitar datos reales. Los archivos no están cifrados; permisos de archivo POSIX no sustituyen ACL de Windows. Permanecen bajo la cuenta local y pueden sincronizarse con OneDrive si el proyecto está dentro de esa carpeta. “Local” no implica que OneDrive esté desactivado; mover `DATA_DIR` a una ubicación local autorizada fuera de la carpeta sincronizada si se requiere evitar esa sincronización.

Retención: siete días por defecto, configurable 1–30. Se borran únicamente archivos UUID `.jsonl` vencidos en el directorio configurado. Reiniciar una conversación no borra sus registros; reiniciar el proceso elimina contexto activo, conservando las bitácoras vigentes. No hay exportación pública ni panel de clientes.

Con OpenAI activado, los mensajes redactados y datos del catálogo se transmiten al proveedor oficial. `store=false` desactiva almacenamiento de Responses, sin prometer ausencia de otros registros de seguridad del proveedor. Revisar condiciones y políticas vigentes antes de usar datos reales.

## Próximos controles de producción

Antes de exposición pública: autenticación/autorización, políticas de privacidad, almacenamiento autorizado, cifrado, gestión de secretos, observabilidad sin PII, control de gasto, cuotas persistentes, auditoría de acceso, pruebas adversariales y evaluación conversacional. WhatsApp requiere verificación de firmas e idempotencia; Shopify autorizado requiere permisos mínimos y revisión de APIs vigentes. Estos componentes quedan fuera de la Fase 1.
