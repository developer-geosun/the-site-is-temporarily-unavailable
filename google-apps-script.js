/**
 * Google Apps Script Web App для збереження вибраних напрямків в Google Sheets
 * 
 * ІНСТРУКЦІЇ:
 * 1. Відкрийте https://script.google.com
 * 2. Створіть новий проект
 * 3. Скопіюйте цей код в редактор
 * 4. Замініть SPREADSHEET_ID на ID вашої таблиці (без лапок)
 * 5. Збережіть проект (Ctrl+S)
 * 6. Натисніть "Розгорнути" -> "Нове розгортання"
 * 7. Виберіть тип: "Веб-додаток"
 * 8. Встановіть:
 *    - Опис: "Web App for saving border crossing selections"
 *    - Виконувати як: "Я"
 *    - Хто має доступ: "Усі"
 * 9. Натисніть "Розгорнути"
 * 10. Скопіюйте URL Web App та вставте його в script.js в константу WEB_APP_URL
 */

// ID вашої Google Sheets таблиці
const SPREADSHEET_ID = '1vycGvADK5hFhV2jiqxhtTEeKW_HTwlTEFvVtjkZ3kaE';

// Назва аркуша для збереження даних
const BORDER_SHEET_NAME = 'Border';

/**
 * Функція doPost обробляє POST запити від веб-сторінки
 */
function doPost(e) {
  try {
    let direction, timestamp;
    
    // Спробуємо отримати дані з JSON
    if (e.postData && e.postData.contents) {
      try {
        const requestData = JSON.parse(e.postData.contents);
        direction = requestData.direction;
        timestamp = requestData.timestamp || new Date().toISOString();
      } catch (jsonError) {
        // Якщо не JSON, спробуємо FormData
        const formData = e.parameter;
        direction = formData.direction;
        timestamp = formData.timestamp || new Date().toISOString();
      }
    } else {
      // Якщо немає postData, використовуємо параметри
      direction = e.parameter.direction;
      timestamp = e.parameter.timestamp || new Date().toISOString();
    }
    
    if (!direction) {
      throw new Error('Напрямок не вказано');
    }
    
    return saveToSheet(direction, timestamp);
      
  } catch (error) {
    // Повертаємо помилку
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Функція doGet обробляє GET запити (з URL параметрами)
 */
function doGet(e) {
  try {
    const direction = e.parameter.direction;
    const timestamp = e.parameter.timestamp || new Date().toISOString();
    
    if (!direction) {
      // Якщо немає параметрів, повертаємо статус
      return ContentService
        .createTextOutput(JSON.stringify({
          status: 'OK',
          message: 'Web App працює',
          timestamp: new Date().toISOString()
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return saveToSheet(direction, timestamp);
    
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Допоміжна функція для збереження даних в таблицю
 */
function saveToSheet(direction, timestamp) {
  // Відкриваємо таблицю
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // Отримуємо або створюємо аркуш "Border"
  let sheet = spreadsheet.getSheetByName(BORDER_SHEET_NAME);
  if (!sheet) {
    // Якщо аркуш не існує, створюємо його
    sheet = spreadsheet.insertSheet(BORDER_SHEET_NAME);
    // Додаємо заголовки
    sheet.getRange(1, 1, 1, 2).setValues([['Дата/Час', 'Напрямок']]);
    // Форматуємо заголовки
    sheet.getRange(1, 1, 1, 2).setFontWeight('bold');
    sheet.getRange(1, 1, 1, 2).setBackground('#4285f4');
    sheet.getRange(1, 1, 1, 2).setFontColor('#ffffff');
  }
  
  // Форматуємо дату/час
  const dateTime = new Date(timestamp);
  const formattedDateTime = Utilities.formatDate(
    dateTime,
    Session.getScriptTimeZone(),
    'yyyy-MM-dd HH:mm:ss'
  );
  
  // Додаємо новий рядок з даними
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, 1, 2).setValues([
    [formattedDateTime, direction]
  ]);
  
  // Повертаємо успішну відповідь
  return ContentService
    .createTextOutput(JSON.stringify({
      success: true,
      message: 'Дані успішно збережено',
      row: lastRow + 1
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

