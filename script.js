// Конфігурація Google Sheets
const SHEET_ID = '1vycGvADK5hFhV2jiqxhtTEeKW_HTwlTEFvVtjkZ3kaE';
const SHEET_NAME = 'Ref_border_crosing_of_Ukraine';
const COLUMN_NAME = 'ukraine_and_country';
const BORDER_SHEET_NAME = 'Border'; // Назва аркуша для збереження виборів

// URL Google Apps Script Web App для збереження даних
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxLEkOM3CzZi5Ca6NGiHoJDVXunGWdZ0JSQAi5hIFAeQ4t0rWe4FgXIlIaaHiqFtvWu/exec';

// Функція для парсингу CSV (покращена версія)
function parseCSV(csvText) {
    // Функція для розбиття CSV рядка на колонки
    function parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];
            
            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    // Подвійні лапки - екранована лапка
                    current += '"';
                    i++; // Пропускаємо наступну лапку
                } else {
                    // Початок/кінець поля в лапках
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                // Кінець поля
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        // Додаємо останнє поле
        result.push(current.trim());
        return result;
    }

    const lines = csvText.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) {
        throw new Error('CSV файл порожній');
    }

    // Парсимо заголовки
    const headers = parseCSVLine(lines[0]);
    
    // Видаляємо лапки з заголовків, якщо вони є
    const cleanHeaders = headers.map(h => h.replace(/^"|"$/g, '').trim());

    const columnIndex = cleanHeaders.findIndex(h => h === COLUMN_NAME);
    if (columnIndex === -1) {
        console.log('Доступні стовпчики:', cleanHeaders);
        throw new Error(`Стовпчик "${COLUMN_NAME}" не знайдено. Доступні: ${cleanHeaders.join(', ')}`);
    }

    // Парсимо дані
    const values = [];
    for (let i = 1; i < lines.length; i++) {
        try {
            const row = parseCSVLine(lines[i]);
            
            // Перевіряємо, чи рядок має достатньо колонок
            if (row.length <= columnIndex) {
                console.warn(`Рядок ${i + 1} має менше колонок, ніж очікується. Пропускаємо.`);
                continue;
            }
            
            // Видаляємо лапки зі значень
            const cleanRow = row.map(cell => {
                if (cell === null || cell === undefined) return '';
                return String(cell).replace(/^"|"$/g, '').trim();
            });
            
            // Перевіряємо, чи є значення в потрібній колонці
            const cellValue = cleanRow[columnIndex];
            if (cellValue && cellValue.trim() && cellValue !== 'null' && cellValue !== 'undefined') {
                values.push(cellValue.trim());
            }
        } catch (error) {
            console.warn(`Помилка парсингу рядка ${i + 1}:`, error);
            // Продовжуємо обробку інших рядків
            continue;
        }
    }

    return values;
}

// Функція для завантаження даних з Google Sheets (JSON метод)
async function loadDataFromGoogleSheetsJSON() {
    const jsonUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}`;
    
    const response = await fetch(jsonUrl);
    if (!response.ok) {
        throw new Error(`HTTP помилка: ${response.status} ${response.statusText}`);
    }
    
    const text = await response.text();
    
    // Перевіряємо, чи є помилка в відповіді
    if (text.includes('error')) {
        throw new Error('Google Sheets повернув помилку. Перевірте, чи таблиця опублікована.');
    }
    
    // Видаляємо префікс, який додає Google (більш надійний метод)
    // Формат: /*O_o*/ google.visualization.Query.setResponse({...});
    let jsonText = text.trim();
    
    // Знаходимо початок JSON об'єкта
    const jsonStart = jsonText.indexOf('{');
    if (jsonStart === -1) {
        throw new Error('Не вдалося знайти JSON дані у відповіді');
    }
    
    // Знаходимо кінець JSON об'єкта (остання закриваюча дужка перед крапкою з комою)
    let jsonEnd = jsonText.lastIndexOf('}');
    if (jsonEnd === -1) {
        throw new Error('Не вдалося знайти кінець JSON даних');
    }
    
    // Витягуємо JSON
    jsonText = jsonText.substring(jsonStart, jsonEnd + 1);
    
    let data;
    try {
        data = JSON.parse(jsonText);
    } catch (parseError) {
        console.error('Помилка парсингу JSON:', parseError);
        console.error('Спроба парсити:', jsonText.substring(0, 200) + '...');
        throw new Error(`Помилка парсингу JSON: ${parseError.message}`);
    }
    
    // Перевіряємо структуру даних
    if (!data.table || !data.table.cols || !data.table.rows) {
        throw new Error('Невірна структура даних від Google Sheets');
    }
    
    const table = data.table;
    const cols = table.cols;
    const rows = table.rows;
    
    // Знаходимо індекс стовпчика
    const columnIndex = cols.findIndex(col => col.label === COLUMN_NAME);
    
    if (columnIndex === -1) {
        const availableColumns = cols.map(col => col.label).join(', ');
        throw new Error(`Стовпчик "${COLUMN_NAME}" не знайдено. Доступні: ${availableColumns}`);
    }

    // Витягуємо значення
    const rawValues = rows
        .map((row, index) => {
            try {
                // Перевіряємо, чи є комірки в рядку
                if (!row.c || !Array.isArray(row.c)) {
                    console.warn(`Рядок ${index + 1} не має комірок. Пропускаємо.`);
                    return null;
                }
                
                // Перевіряємо, чи є комірка в потрібній колонці
                if (columnIndex >= row.c.length) {
                    console.warn(`Рядок ${index + 1} має менше колонок, ніж очікується. Пропускаємо.`);
                    return null;
                }
                
                const cell = row.c[columnIndex];
                
                // Перевіряємо, чи комірка існує та має значення
                if (!cell) {
                    return null;
                }
                
                // Витягуємо значення
                const value = cell.v;
                if (value === null || value === undefined || value === '') {
                    return null;
                }
                
                // Конвертуємо в рядок та очищаємо
                const stringValue = String(value).trim();
                return stringValue || null;
            } catch (error) {
                console.warn(`Помилка обробки рядка ${index + 1}:`, error);
                return null;
            }
        })
        .filter(value => value !== null && value !== '' && value !== 'null' && value !== 'undefined');

    return rawValues;
}

// Функція для завантаження даних з Google Sheets (CSV метод)
async function loadDataFromGoogleSheetsCSV() {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;
    
    const response = await fetch(csvUrl);
    if (!response.ok) {
        throw new Error(`HTTP помилка: ${response.status} ${response.statusText}`);
    }
    
    const csvText = await response.text();
    return parseCSV(csvText);
}

// Основна функція для завантаження даних (спробує JSON, потім CSV)
async function loadDataFromGoogleSheets() {
    let lastError = null;
    
    // Спробуємо JSON метод
    try {
        const rawValues = await loadDataFromGoogleSheetsJSON();
        
        // Фільтруємо унікальні значення
        const uniqueValues = [...new Set(rawValues)];
        
        // Сортуємо за алфавітом
        uniqueValues.sort((a, b) => a.localeCompare(b, 'uk'));
        
        return uniqueValues;
    } catch (error) {
        console.warn('JSON метод не спрацював, пробуємо CSV:', error);
        lastError = error;
        
        // Спробуємо CSV метод
        try {
            const rawValues = await loadDataFromGoogleSheetsCSV();
            
            // Фільтруємо унікальні значення
            const uniqueValues = [...new Set(rawValues)];
            
            // Сортуємо за алфавітом
            uniqueValues.sort((a, b) => a.localeCompare(b, 'uk'));
            
            return uniqueValues;
        } catch (csvError) {
            console.error('CSV метод також не спрацював:', csvError);
            throw new Error(`Не вдалося завантажити дані. JSON помилка: ${lastError.message}. CSV помилка: ${csvError.message}`);
        }
    }
}

// GID аркуша "Ref_border_crosing_of_Ukraine"
const SHEET_GID = '1789958792';

// Функція для відкриття таблиці на конкретному аркуші
function openSheetWithTab(event) {
    event.preventDefault();
    
    // Використовуємо GID для відкриття конкретного аркуша
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=${SHEET_GID}`;
    
    window.open(url, '_blank', 'noopener,noreferrer');
}

// Функція для заповнення випадаючого списку
function populateSelect(uniqueValues) {
    const selectElement = document.getElementById('borderSelect');
    const countBadge = document.getElementById('countBadge');

    // Очищаємо список (крім першого елемента)
    while (selectElement.children.length > 1) {
        selectElement.removeChild(selectElement.lastChild);
    }

    // Заповнюємо Select
    uniqueValues.forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        selectElement.appendChild(option);
    });

    // Оновлюємо лічильник
    countBadge.textContent = `${uniqueValues.length} варіантів`;
}

document.addEventListener('DOMContentLoaded', async () => {
    const selectElement = document.getElementById('borderSelect');
    const resultCard = document.getElementById('resultCard');
    const selectedText = document.getElementById('selectedText');
    const countBadge = document.getElementById('countBadge');

    // Показуємо індикатор завантаження
    countBadge.textContent = 'Завантаження...';
    selectElement.disabled = true;

    try {
        // Завантажуємо дані з Google Sheets
        const uniqueValues = await loadDataFromGoogleSheets();
        
        if (uniqueValues.length === 0) {
            throw new Error('Не знайдено жодного значення в стовпчику ukraine_and_country');
        }
        
        // Заповнюємо список
        populateSelect(uniqueValues);
        
        // Вмикаємо select
        selectElement.disabled = false;
        
        // Ховаємо картку помилки, якщо вона була показана
        const errorCard = document.getElementById('errorCard');
        if (errorCard) {
            errorCard.classList.add('hidden');
        }
    } catch (error) {
        // Показуємо помилку
        countBadge.textContent = 'Помилка';
        selectElement.innerHTML = '<option value="" disabled selected>Помилка завантаження даних</option>';
        selectElement.disabled = true;
        
        // Показуємо детальну інформацію про помилку
        const errorCard = document.getElementById('errorCard');
        const errorText = document.getElementById('errorText');
        if (errorCard && errorText) {
            errorText.textContent = error.message || 'Невідома помилка';
            errorCard.classList.remove('hidden');
        }
        
        console.error('Детальна помилка:', error);
    }

    // Обробка вибору
    selectElement.addEventListener('change', async (e) => {
        const value = e.target.value;
        if (value) {
            selectedText.textContent = value;
            resultCard.classList.remove('hidden');
            // Small delay to allow display block to apply before opacity transition
            setTimeout(() => {
                resultCard.classList.remove('translate-y-2', 'opacity-0');
            }, 10);
            
            // Зберігаємо вибраний напрямок в Google Sheets
            await saveSelectedDirection(value);
        }
    });
});

// Функція для збереження вибраного напрямку в Google Sheets
async function saveSelectedDirection(direction) {
    // Перевіряємо, чи налаштовано URL Web App
    if (!WEB_APP_URL || WEB_APP_URL.trim() === '') {
        console.warn('Web App URL не налаштовано. Пропускаємо збереження.');
        return;
    }
    
    try {
        // Показуємо індикатор збереження
        const resultCard = document.getElementById('resultCard');
        const selectedText = document.getElementById('selectedText');
        const originalText = selectedText.textContent;
        selectedText.textContent = `${originalText} (збереження...)`;
        
        // Використовуємо GET запит з URL параметрами (найнадійніший метод для Google Apps Script)
        const params = new URLSearchParams();
        params.append('direction', direction);
        params.append('timestamp', new Date().toISOString());
        
        const urlWithParams = `${WEB_APP_URL}?${params.toString()}`;
        
        // Використовуємо fetch з CORS для отримання відповіді
        const response = await fetch(urlWithParams, {
            method: 'GET',
            mode: 'cors',
            cache: 'no-cache'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP помилка: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            // Показуємо успішне збереження
            selectedText.textContent = `${originalText} ✓`;
            selectedText.classList.add('text-green-600');
            
            // Прибираємо галочку через 2 секунди
            setTimeout(() => {
                selectedText.textContent = originalText;
                selectedText.classList.remove('text-green-600');
            }, 2000);
        } else {
            throw new Error(result.error || 'Помилка збереження');
        }
        
    } catch (error) {
        console.error('Помилка збереження напрямку:', error);
        
        // Показуємо помилку
        const selectedText = document.getElementById('selectedText');
        const originalText = selectedText.textContent.replace(/\s*\(збереження\.\.\.\)|\s*✓/g, '');
        selectedText.textContent = `${originalText} (помилка збереження)`;
        selectedText.classList.add('text-red-600');
        
        // Прибираємо повідомлення про помилку через 3 секунди
        setTimeout(() => {
            selectedText.textContent = originalText;
            selectedText.classList.remove('text-red-600');
        }, 3000);
    }
}

