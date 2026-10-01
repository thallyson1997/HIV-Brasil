const csvPath = "../../DADOS/dados_aids_hiv.csv";
const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const yearFilter = document.querySelector("#year-filter");
const totalCases = document.querySelector("#total-cases");
const summaryYear = document.querySelector("#summary-year");
const chartCanvas = document.querySelector("#cases-chart");
const statusMessage = document.querySelector("#status-message");
let monthlyCases = {};
let casesChart;

function showError(message) {
  statusMessage.textContent = message;
  statusMessage.classList.add("status-error");
  statusMessage.hidden = false;
  chartCanvas.hidden = true;
}

function renderYear(year) {
  const counts = monthlyCases[year];
  if (!counts) return;

  const values = monthNames.map((_, month) => counts[month] || 0);
  totalCases.textContent = values.reduce((sum, count) => sum + count, 0).toLocaleString("pt-BR");
  summaryYear.textContent = year;
  statusMessage.hidden = true;
  chartCanvas.hidden = false;

  if (casesChart) {
    casesChart.data.datasets[0].data = values;
    casesChart.update();
    return;
  }

  casesChart = new Chart(chartCanvas, {
    type: "bar",
    data: {
      labels: monthNames,
      datasets: [{
        data: values,
        backgroundColor: "#22836f",
        hoverBackgroundColor: "#155d50",
        borderRadius: 3,
        maxBarThickness: 34
      }]
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: { label: (context) => `${context.raw.toLocaleString("pt-BR")} notificações` }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: "#68756e", font: { family: "DM Sans", size: 12 } }
        },
        y: {
          beginAtZero: true,
          border: { display: false, dash: [3, 4] },
          grid: { color: "#e6ebe6", drawTicks: false },
          ticks: {
            color: "#8b958f",
            padding: 10,
            precision: 0,
            font: { family: "DM Sans", size: 11 },
            callback: (value) => Number(value).toLocaleString("pt-BR")
          }
        }
      }
    }
  });
}

Papa.parse(csvPath, {
  download: true,
  header: true,
  delimiter: ";",
  skipEmptyLines: true,
  complete: ({ data, errors }) => {
    if (errors.length && !data.length) {
      showError("Não foi possível ler os dados. Abra esta página por um servidor HTTP.");
      return;
    }

    for (const row of data) {
      const date = row.dt_notific;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const year = date.slice(0, 4);
      const month = Number(date.slice(5, 7)) - 1;
      if (month < 0 || month > 11) continue;
      monthlyCases[year] ??= Array(12).fill(0);
      monthlyCases[year][month] += 1;
    }

    const years = Object.keys(monthlyCases).sort((a, b) => Number(b) - Number(a));
    if (!years.length) {
      showError("Nenhuma notificação com data válida foi encontrada.");
      return;
    }

    yearFilter.replaceChildren(...years.map((year) => new Option(year, year)));
    yearFilter.value = monthlyCases["2026"] ? "2026" : years[0];
    yearFilter.disabled = false;
    renderYear(yearFilter.value);
  },
  error: () => showError("Não foi possível carregar os dados. Abra esta página por um servidor HTTP.")
});

yearFilter.addEventListener("change", (event) => renderYear(event.target.value));