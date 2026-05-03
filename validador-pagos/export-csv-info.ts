/**
 * Exporta Google Sheets a CSV usando fetch directo (más simple)
 */

const SHEET_ID = "1l2PODqxJeecLP7ZhNMtDmMXBIkIGgkYWhI5hKgr4kKY";
const TABS = ["Hoja 1", "PagosDivisas", "Usuarios", "Solicitudes", "Extractos"];
const API_KEY = "AIzaSyBWB7GTcQxGx7Q1ks7Q9eFRsBUqWqXJOU"; // Necesitas configurar esta API key o usar service account

console.log("Para exportar manualmente:");
TABS.forEach(tab => {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  console.log(`${tab}: ${url}`);
});

console.log("\nO usa este script con curl:");
console.log(`
# Ejemplo con curl (descarga todos los CSV):
curl -L "https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Hoja%201" -o Hoja_1.csv
curl -L "https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=PagosDivisas" -o PagosDivisas.csv
curl -L "https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Usuarios" -o Usuarios.csv
curl -L "https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Solicitudes" -o Solicitudes.csv
curl -L "https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Extractos" -o Extractos.csv
`);
