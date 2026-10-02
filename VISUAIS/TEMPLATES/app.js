const csvPath = "../../DADOS/dados_aids_hiv.csv";

const geoJsonPath =
  "https://cdn.jsdelivr.net/gh/henriquemalvar/br-geojson@main/dist/municipios/MG.geojson";

/* =========================================================
   CONFIGURAÇÕES
========================================================= */

const monthNames = [
  "Jan", "Fev", "Mar", "Abr",
  "Mai", "Jun", "Jul", "Ago",
  "Set", "Out", "Nov", "Dez"
];

const incidenceMultiplier = 100000;

/* =========================================================
   ELEMENTOS DA PÁGINA
========================================================= */

const yearFilter = document.querySelector("#year-filter");

const totalCases = document.querySelector("#total-cases");
const summaryYear = document.querySelector("#summary-year");

const chartCanvas = document.querySelector("#cases-chart");
const statusMessage = document.querySelector("#status-message");

const mapElement = document.querySelector("#map");
const mapLoading = document.querySelector("#map-loading");

const selectedMunicipality = document.querySelector(
  "#selected-municipality"
);

const selectedMunicipalityName = document.querySelector(
  "#selected-municipality-name"
);

const clearMunicipalityButton = document.querySelector(
  "#clear-municipality"
);

const municipalitySummary = document.querySelector(
  "#municipality-summary"
);

const municipalitySummaryName = document.querySelector(
  "#municipality-summary-name"
);

const municipalityTotalCases = document.querySelector(
  "#municipality-total-cases"
);

const chartDescription = document.querySelector(
  "#chart-description"
);

/* =========================================================
   ESTADO DA APLICAÇÃO
========================================================= */

let rows = [];
let monthlyCases = {};
let municipalityCases = {};
let municipalityPopulation = {};
let years = [];

let casesChart = null;

let map = null;
let municipalityLayer = null;

let selectedMunicipalityCode = null;

let geoJsonData = null;

let hasPopulationData = false;

/* =========================================================
   UTILITÁRIOS
========================================================= */

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  let text = String(value).trim();

  /*
   * Formatos brasileiros:
   * 1.234,56
   * 1234,56
   *
   * Formatos simples:
   * 1234.56
   */

  if (text.includes(".") && text.includes(",")) {
    text = text
      .replace(/\./g, "")
      .replace(",", ".");
  } else if (text.includes(",")) {
    text = text.replace(",", ".");
  }

  const number = Number(text);

  return Number.isFinite(number)
    ? number
    : null;
}

/* =========================================================
   CÓDIGO DO MUNICÍPIO NO CSV
========================================================= */

function getMunicipalityCode(row) {
  const possibleColumns = [
    "co_mun_res",
    "co_municipio",
    "codigo_ibge",
    "cod_ibge",
    "cod_municipio",
    "municipio_codigo",
    "ibge"
  ];

  for (const column of possibleColumns) {
    if (
      row[column] !== undefined &&
      row[column] !== ""
    ) {
      const value =
        String(row[column]).trim();

      const digits =
        value.replace(/\D/g, "");

      if (digits.length === 7) {
        return digits;
      }
    }
  }

  return null;
}

/* =========================================================
   NOME DO MUNICÍPIO NO CSV
========================================================= */

function getMunicipalityName(row) {
  const possibleColumns = [
    "municipio",
    "nome_municipio",
    "no_municipio",
    "no_mun_res",
    "municipio_nome",
    "mun_res",
    "nome_mun"
  ];

  for (const column of possibleColumns) {
    if (
      row[column] !== undefined &&
      row[column] !== ""
    ) {
      return String(row[column]).trim();
    }
  }

  return "Município não identificado";
}

/* =========================================================
   POPULAÇÃO DO MUNICÍPIO
========================================================= */

function getPopulation(row) {
  const possibleColumns = [
    "populacao",
    "população",
    "population",
    "pop_municipio",
    "populacao_municipio"
  ];

  for (const column of possibleColumns) {
    if (
      row[column] !== undefined &&
      row[column] !== ""
    ) {
      const value =
        normalizeNumber(row[column]);

      if (
        value !== null &&
        value > 0
      ) {
        return value;
      }
    }
  }

  return null;
}

/* =========================================================
   FORMATAÇÃO
========================================================= */

function formatNumber(value) {
  return Number(value || 0)
    .toLocaleString("pt-BR");
}

function formatIncidence(value) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return value.toLocaleString(
    "pt-BR",
    {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }
  );
}

/* =========================================================
   CÓDIGO DO MUNICÍPIO NO GEOJSON
========================================================= */

function getGeoJsonMunicipalityCode(feature) {
  const properties =
    feature?.properties || {};

  const possibleValues = [
    properties.cd_geocmu,
    properties.codigo_ibge,
    properties.cod_ibge,
    properties.id
  ];

  for (const value of possibleValues) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      const digits =
        String(value).replace(
          /\D/g,
          ""
        );

      if (digits.length === 7) {
        return digits;
      }
    }
  }

  return null;
}

/* =========================================================
   NOME DO MUNICÍPIO NO GEOJSON
========================================================= */

function getGeoJsonMunicipalityName(feature) {
  const properties =
    feature?.properties || {};

  return (
    properties.nome ||
    properties.name ||
    properties.municipio ||
    "Município"
  );
}

/* =========================================================
   MENSAGEM DE ERRO
========================================================= */

function showError(message) {
  statusMessage.textContent =
    message;

  statusMessage.classList.add(
    "status-error"
  );

  statusMessage.hidden = false;

  chartCanvas.hidden = true;
}

/* =========================================================
   PROCESSAMENTO DOS DADOS
========================================================= */

function processData(data) {
  rows = [];

  monthlyCases = {};

  municipalityCases = {};

  municipalityPopulation = {};

  hasPopulationData = false;

  for (const row of data) {
    const date =
      String(
        row.dt_notific ?? ""
      ).trim();

    /*
     * Aceita somente:
     * YYYY-MM-DD
     */

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        date
      )
    ) {
      continue;
    }

    const year =
      date.slice(0, 4);

    const month =
      Number(
        date.slice(5, 7)
      ) - 1;

    if (
      month < 0 ||
      month > 11
    ) {
      continue;
    }

    const municipalityCode =
      getMunicipalityCode(row);

    const municipalityName =
      getMunicipalityName(row);

    const population =
      getPopulation(row);

    /*
     * Guarda o registro normalizado.
     */

    rows.push({
      date,
      year,
      month,
      municipalityCode,
      municipalityName,
      population
    });

    /*
     * Total geral por ano/mês.
     */

    monthlyCases[year] ??=
      Array(12).fill(0);

    monthlyCases[year][month] += 1;

    /*
     * Total por município.
     */

    if (municipalityCode) {
      municipalityCases[year] ??= {};

      municipalityCases[year][municipalityCode] ??= {
        name: municipalityName,
        months: Array(12).fill(0),
        total: 0
      };

      municipalityCases[year][municipalityCode]
        .months[month] += 1;

      municipalityCases[year][municipalityCode]
        .total += 1;

      /*
       * População, caso exista no CSV.
       */

      if (population !== null) {
        municipalityPopulation[year] ??= {};

        municipalityPopulation[year][municipalityCode] =
          population;

        hasPopulationData = true;
      }
    }
  }

  years =
    Object.keys(monthlyCases)
      .sort(
        (a, b) =>
          Number(b) - Number(a)
      );
}

/* =========================================================
   TOTAL DO ANO
========================================================= */

function getYearTotal(year) {
  const counts =
    monthlyCases[year];

  if (!counts) {
    return 0;
  }

  return counts.reduce(
    (sum, count) =>
      sum + count,
    0
  );
}

/* =========================================================
   DADOS DO MUNICÍPIO
========================================================= */

function getMunicipalityData(
  year,
  code
) {
  if (
    !municipalityCases[year] ||
    !municipalityCases[year][code]
  ) {
    return null;
  }

  return municipalityCases[year][code];
}

/* =========================================================
   RESUMO
========================================================= */

function updateSummary(year) {
  const total =
    getYearTotal(year);

  totalCases.textContent =
    formatNumber(total);

  summaryYear.textContent =
    year;
}

/* =========================================================
   GRÁFICO
========================================================= */

function renderChart(
  year,
  municipalityCode = null
) {
  let values;

  if (municipalityCode) {
    const municipalityData =
      getMunicipalityData(
        year,
        municipalityCode
      );

    if (municipalityData) {
      values =
        municipalityData.months;
    } else {
      values =
        Array(12).fill(0);
    }
  } else {
    values =
      monthlyCases[year] ||
      Array(12).fill(0);
  }

  statusMessage.hidden = true;

  chartCanvas.hidden = false;

  /*
   * Se o gráfico já existe,
   * apenas atualiza os valores.
   */

  if (casesChart) {
    casesChart.data.datasets[0]
      .data = values;

    casesChart.update();

    return;
  }

  /*
   * Cria o gráfico.
   */

  casesChart =
    new Chart(
      chartCanvas,
      {
        type: "bar",

        data: {
          labels: monthNames,

          datasets: [
            {
              data: values,

              backgroundColor:
                "#22836f",

              hoverBackgroundColor:
                "#155d50",

              borderRadius: 3,

              maxBarThickness: 34
            }
          ]
        },

        options: {
          maintainAspectRatio: false,

          responsive: true,

          plugins: {
            legend: {
              display: false
            },

            tooltip: {
              displayColors: false,

              callbacks: {
                label:
                  (context) =>
                    `${formatNumber(
                      context.raw
                    )} notificações`
              }
            }
          },

          scales: {
            x: {
              grid: {
                display: false
              },

              border: {
                display: false
              },

              ticks: {
                color: "#68756e",

                font: {
                  family: "DM Sans",
                  size: 12
                }
              }
            },

            y: {
              beginAtZero: true,

              border: {
                display: false,

                dash: [3, 4]
              },

              grid: {
                color: "#e6ebe6",

                drawTicks: false
              },

              ticks: {
                color: "#8b958f",

                padding: 10,

                precision: 0,

                font: {
                  family: "DM Sans",
                  size: 11
                },

                callback:
                  (value) =>
                    Number(value)
                      .toLocaleString(
                        "pt-BR"
                      )
              }
            }
          }
        }
      }
    );
}

/* =========================================================
   ATUALIZAÇÃO DO GRÁFICO
========================================================= */

function updateChart(year) {
  if (selectedMunicipalityCode) {
    renderChart(
      year,
      selectedMunicipalityCode
    );

    const municipalityData =
      getMunicipalityData(
        year,
        selectedMunicipalityCode
      );

    if (municipalityData) {
      chartDescription.textContent =
        `Notificações mensais em ${municipalityData.name}`;
    } else {
      chartDescription.textContent =
        "Nenhuma notificação registrada para este município neste ano";
    }

    return;
  }

  renderChart(year);

  chartDescription.textContent =
    "Notificações registradas em cada mês";
}

/* =========================================================
   VALOR DO MAPA
========================================================= */

function getMapValue(
  year,
  municipalityCode
) {
  const data =
    getMunicipalityData(
      year,
      municipalityCode
    );

  if (!data) {
    return 0;
  }

  /*
   * Se houver população:
   *
   * incidência =
   * casos / população × 100.000
   */

  if (
    hasPopulationData &&
    municipalityPopulation[year] &&
    municipalityPopulation[year][municipalityCode]
  ) {
    const population =
      municipalityPopulation[year][municipalityCode];

    return (
      data.total /
      population *
      incidenceMultiplier
    );
  }

  /*
   * Sem população:
   * utiliza número absoluto.
   */

  return data.total;
}

/* =========================================================
   MAIOR VALOR DO MAPA
========================================================= */

function getMapMax(year) {
  let max = 0;

  const municipalities =
    municipalityCases[year] || {};

  for (
    const code of Object.keys(
      municipalities
    )
  ) {
    const value =
      getMapValue(
        year,
        code
      );

    if (value > max) {
      max = value;
    }
  }

  return max;
}

/* =========================================================
   ESCALA DE CORES
========================================================= */

function getColor(
  value,
  max
) {
  if (
    !value ||
    value <= 0
  ) {
    return "#edf4ef";
  }

  if (
    !max ||
    max <= 0
  ) {
    return "#edf4ef";
  }

  const ratio =
    value / max;

  if (ratio <= 0.2) {
    return "#c9e2d4";
  }

  if (ratio <= 0.4) {
    return "#8fc5ad";
  }

  if (ratio <= 0.6) {
    return "#4e9d83";
  }

  if (ratio <= 0.8) {
    return "#347f6b";
  }

  return "#236f5d";
}

/* =========================================================
   ESTILO DOS MUNICÍPIOS
========================================================= */

function municipalityStyle(feature) {
  const year =
    yearFilter.value;

  const code =
    getGeoJsonMunicipalityCode(
      feature
    );

  const value =
    code
      ? getMapValue(
          year,
          code
        )
      : 0;

  const max =
    getMapMax(year);

  const isSelected =
    selectedMunicipalityCode ===
    code;

  const isDimmed =
    selectedMunicipalityCode &&
    !isSelected;

  return {
    fillColor:
      getColor(
        value,
        max
      ),

    weight:
      isSelected
        ? 3
        : 0.7,

    opacity:
      isDimmed
        ? 0.45
        : 1,

    color:
      isSelected
        ? "#153f35"
        : "#ffffff",

    fillOpacity:
      isSelected
        ? 1
        : isDimmed
          ? 0.35
          : 0.88
  };
}

/* =========================================================
   POPUP
========================================================= */

function createPopupContent(
  year,
  municipalityCode
) {
  const data =
    getMunicipalityData(
      year,
      municipalityCode
    );

  const name =
    data?.name ||
    "Município";

  const total =
    data?.total || 0;

  const value =
    getMapValue(
      year,
      municipalityCode
    );

  const hasMunicipalityPopulation =
    municipalityPopulation[year] &&
    municipalityPopulation[year][municipalityCode];

  let valueLabel;

  if (hasMunicipalityPopulation) {
    valueLabel =
      `${formatIncidence(
        value
      )} casos por 100 mil habitantes`;
  } else {
    valueLabel =
      `${formatNumber(
        value
      )} notificações`;
  }

  return `
    <div class="map-popup-title">
      ${name}
    </div>

    <div class="map-popup-value">
      ${formatNumber(
        total
      )} notificações em ${year}
    </div>

    <div class="map-popup-value">
      ${valueLabel}
    </div>
  `;
}

/* =========================================================
   INICIALIZAÇÃO DO MAPA
========================================================= */

function initializeMap() {
  if (!mapElement) {
    console.error(
      "Elemento #map não encontrado."
    );

    return;
  }

  map =
    L.map(
      "map",
      {
        zoomControl: true,

        attributionControl: true,

        minZoom: 6,

        maxZoom: 10
      }
    );

  /*
   * Centro aproximado de Minas Gerais.
   */

  map.setView(
    [-18.5, -44.5],
    6
  );

  /*
   * Não utilizamos mapa de fundo.
   */

  loadGeoJson();
}

/* =========================================================
   CARREGA GEOJSON
========================================================= */

async function loadGeoJson() {
  try {
    mapLoading.hidden =
      false;

    const response =
      await fetch(
        geoJsonPath
      );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    geoJsonData =
      await response.json();

    renderMunicipalityLayer();

    mapLoading.hidden =
      true;

  } catch (error) {
    console.error(
      "Erro ao carregar o mapa:",
      error
    );

    mapLoading.textContent =
      "Não foi possível carregar o mapa dos municípios.";

    mapLoading.classList.add(
      "status-error"
    );
  }
}

/* =========================================================
   RENDERIZA MUNICÍPIOS
========================================================= */

function renderMunicipalityLayer() {
  if (!geoJsonData) {
    return;
  }

  if (municipalityLayer) {
    municipalityLayer.remove();
  }

  const year =
    yearFilter.value;

  municipalityLayer =
    L.geoJSON(
      geoJsonData,
      {
        style:
          municipalityStyle,

        onEachFeature:
          (
            feature,
            layer
          ) => {
            const code =
              getGeoJsonMunicipalityCode(
                feature
              );

            const municipalityName =
              getGeoJsonMunicipalityName(
                feature
              );

            if (!code) {
              return;
            }

            layer.bindPopup(
              createPopupContent(
                year,
                code
              )
            );

            layer.on({
              mouseover:
                (event) => {
                  const target =
                    event.target;

                  const isSelected =
                    selectedMunicipalityCode ===
                    code;

                  target.setStyle({
                    weight:
                      isSelected
                        ? 3
                        : 2,

                    color:
                      "#153f35",

                    fillOpacity: 1
                  });

                  target.bringToFront();
                },

              mouseout:
                (event) => {
                  /*
                   * Reaplica o estilo correto.
                   */

                  event.target.setStyle(
                    municipalityStyle(
                      feature
                    )
                  );
                },

              click:
                () => {
                  selectMunicipality(
                    code,
                    municipalityName
                  );
                }
            });
          }
      }
    )
    .addTo(map);
}

/* =========================================================
   SELEÇÃO DE MUNICÍPIO
========================================================= */

function selectMunicipality(
  code,
  name
) {
  selectedMunicipalityCode =
    code;

  /*
   * Atualiza o mapa.
   */

  if (municipalityLayer) {
    municipalityLayer.eachLayer(
      (layer) => {
        const layerCode =
          getGeoJsonMunicipalityCode(
            layer.feature
          );

        if (layerCode === code) {
          layer.setStyle({
            weight: 3,

            opacity: 1,

            color: "#153f35",

            fillOpacity: 1
          });

          layer.bringToFront();

        } else {
          layer.setStyle({
            opacity: 0.45,

            fillOpacity: 0.35,

            weight: 0.5,

            color: "#ffffff"
          });
        }
      }
    );
  }

  /*
   * Mostra município selecionado.
   */

  selectedMunicipalityName.textContent =
    name;

  selectedMunicipality.hidden =
    false;

  municipalitySummaryName.textContent =
    name;

  municipalitySummary.hidden =
    false;

  /*
   * Atualiza total.
   */

  const year =
    yearFilter.value;

  const data =
    getMunicipalityData(
      year,
      code
    );

  municipalityTotalCases.textContent =
    formatNumber(
      data?.total || 0
    );

  /*
   * Atualiza gráfico.
   */

  updateChart(year);

  /*
   * Abre popup.
   */

  if (municipalityLayer) {
    municipalityLayer.eachLayer(
      (layer) => {
        const layerCode =
          getGeoJsonMunicipalityCode(
            layer.feature
          );

        if (layerCode === code) {
          layer.openPopup();
        }
      }
    );
  }
}

/* =========================================================
   LIMPA SELEÇÃO
========================================================= */

function clearMunicipalitySelection() {
  selectedMunicipalityCode =
    null;

  selectedMunicipality.hidden =
    true;

  municipalitySummary.hidden =
    true;

  chartDescription.textContent =
    "Notificações registradas em cada mês";

  updateChart(
    yearFilter.value
  );

  if (municipalityLayer) {
    municipalityLayer.eachLayer(
      (layer) => {
        layer.setStyle(
          municipalityStyle(
            layer.feature
          )
        );
      }
    );
  }
}

/* =========================================================
   MUDA O ANO
========================================================= */

function changeYear(year) {
  if (!monthlyCases[year]) {
    return;
  }

  updateSummary(year);

  /*
   * Redesenha o mapa para atualizar
   * as cores do novo ano.
   */

  if (geoJsonData) {
    renderMunicipalityLayer();
  }

  /*
   * Mantém o município selecionado.
   */

  updateChart(year);

  /*
   * Atualiza o total municipal.
   */

  if (selectedMunicipalityCode) {
    const data =
      getMunicipalityData(
        year,
        selectedMunicipalityCode
      );

    municipalityTotalCases.textContent =
      formatNumber(
        data?.total || 0
      );
  }
}

/* =========================================================
   EVENTO DO FILTRO DE ANO
========================================================= */

yearFilter.addEventListener(
  "change",
  (event) => {
    changeYear(
      event.target.value
    );
  }
);

/* =========================================================
   EVENTO DE LIMPAR MUNICÍPIO
========================================================= */

clearMunicipalityButton.addEventListener(
  "click",
  clearMunicipalitySelection
);

/* =========================================================
   CARREGAMENTO DO CSV
========================================================= */

Papa.parse(
  csvPath,
  {
    download: true,

    header: true,

    delimiter: ";",

    skipEmptyLines: true,

    complete: ({
      data,
      errors
    }) => {
      if (
        errors.length &&
        !data.length
      ) {
        showError(
          "Não foi possível ler os dados. Abra esta página por um servidor HTTP."
        );

        return;
      }

      processData(data);

      if (!years.length) {
        showError(
          "Nenhuma notificação com data válida foi encontrada."
        );

        return;
      }

      /*
       * Preenche o seletor de anos.
       */

      yearFilter.replaceChildren(
        ...years.map(
          (year) =>
            new Option(
              year,
              year
            )
        )
      );

      /*
       * Seleciona 2026 quando disponível.
       * Caso contrário, usa o ano mais recente.
       */

      yearFilter.value =
        monthlyCases["2026"]
          ? "2026"
          : years[0];

      yearFilter.disabled =
        false;

      /*
       * Renderiza resumo e gráfico.
       */

      updateSummary(
        yearFilter.value
      );

      renderChart(
        yearFilter.value
      );

      /*
       * Inicializa o mapa.
       */

      initializeMap();
    },

    error: () => {
      showError(
        "Não foi possível carregar os dados. Abra esta página por um servidor HTTP."
      );
    }
  }
);