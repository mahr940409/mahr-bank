# Respaldo con cualquier moneda

## Qué cambia para ti
- Al agregar respaldo a un Banco Nacional o a un Banco Privado podrás escoger **cualquier moneda registrada** (PDH, KYD, COP, USD...), no solo PDH o KYD.
- Cada banco mostrará una tabla "Respaldo" con cada moneda que tiene guardada, la cantidad y **cuánto vale hoy en PDH**. Ese valor sube o baja cuando cambia el valor de esa moneda.
- El único respaldo de valor fijo es el PDH. El KYD se trata como cualquier otra moneda variable: su valor depende de sus propias reservas, impresión y quema (pestaña Países).
- Las reglas que usan respaldo (dinero simbólico, reserva mínima del 10% de los bancos privados, giros internacionales, bonos) se calcularán con el **valor actual en PDH** del respaldo.
- Al registrar dinero simbólico podrás escoger con qué moneda de respaldo se congela.

## Qué no cambia
- Las cuentas, operaciones y comisiones siguen igual.
- Como todo está en cero, no hay respaldos viejos que convertir.

## Detalles técnicos
- Nueva tabla `bank_backings` (tipo de banco nacional/privado, id del banco, moneda, cantidad, cantidad congelada), con acceso abierto igual que las demás tablas.
- Las columnas actuales `pdh_reserve`, `kyd_reserve`, `frozen_pdh`, `frozen_kyd` dejan de usarse (se conservan para no romper nada).
- Función común `backingValuePdh(bank)` = suma de (cantidad × tasa de la moneda a PDH). La usan las métricas de bancos nacionales y privados, la validación del simbólico, la reserva mínima del 10% y los bonos.
- Los selectores `'PDH' | 'KYD'` se reemplazan por un selector con todas las monedas (ordenadas alfabéticamente, lista de 200px).
- Agregar y retirar respaldo sigue pasando por la cuenta principal del MAHR Bank, convirtiendo a PDH con la tasa del momento.
- Se quita la regla que trataba al KYD como 1 a 1 con el PDH en bonos y conversiones.
