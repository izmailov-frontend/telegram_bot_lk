require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const admin = require("firebase-admin");
const fs = require("fs");

// ⚙️ Загружаем токен из .env
const token = process.env.TELEGRAM_TOKEN;
if (!token) {
  console.error("⚠️ Токен Telegram не найден в .env файле!");
  process.exit(1);
}

// ⚙️ Загружаем ключ Firebase
let serviceAccount;
try {
  serviceAccount = JSON.parse(fs.readFileSync("bottelegram-d87cc-firebase-adminsdk-fbsvc-1064240e6c.json", "utf8"));
} catch (error) {
  console.error("⚠️ Ошибка при чтении файла bottelegram-d87cc-firebase-adminsdk-fbsvc-1064240e6c:", error);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
console.log("\ud83d\udd25 Firebase подключён!");

// ⚙️ Подключаем бота
const bot = new TelegramBot(token, { polling: true });
console.log("\ud83e\udd16 Бот запущен...");

// ⚖️ Храним номера пользователей и заказы
const users = {};
const orders = {};

// ⚙️ Главное меню
function sendMainMenu(chatId) {
  bot.sendMessage(
    chatId,
    "\nВыберите действие:",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "\ud83d\udee0 Моё оборудование", callback_data: "my_equipment" }],
          [{ text: "\ud83d\udd27 Техническая поддержка", callback_data: "support" }],
          [{ text: "\ud83d\udce6 Заказать услуги", callback_data: "services" }],
          [{ text: "\ud83d\udcc2 Программы и архивы", callback_data: "downloads" }],
        ],
      },
    }
  );
}

// ⚙️ Обработчик команды /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  bot.sendMessage(
    chatId,
    `\ud83d\udc4b Привет, ${msg.chat.first_name}!\n\nОтправьте ваш номер телефона для входа:`,
    {
      reply_markup: {
        keyboard: [[{ text: "\ud83d\udcde Отправить номер", request_contact: true }]],
        one_time_keyboard: true,
        resize_keyboard: true,
      },
    }
  );
});

// ⚙️ Обработчик номера телефона
bot.on("contact", async (msg) => {
  const chatId = msg.chat.id;
  const phoneNumber = msg.contact.phone_number.replace('+', '');

  console.log("\ud83d\udcde Получен номер телефона:", phoneNumber);

  users[chatId] = phoneNumber;

  try {
    const snapshot = await db.collection("clients").where("phone", "==", phoneNumber).get();

    if (snapshot.empty) {
      bot.sendMessage(chatId, "\u274c Вас нет в базе. Обратитесь в поддержку.");
      return;
    }

    let clientData;
    snapshot.forEach((doc) => {
      clientData = doc.data();
      // Отправляем приветственное сообщение после авторизации
      bot.sendMessage(
        chatId,
        `👋 Здравствуйте, ${clientData.name || "Пользователь"}!\n\n📧 Email: ${clientData.email || "Не указан"}\n📱 Телефон: ${clientData.phone || phoneNumber}\n\n`
      );
    });
    
    users[chatId] = clientData;
    setTimeout(() => sendMainMenu(chatId), 1000); // Задержка перед отправкой главного меню
  } catch (error) {
    console.error("Ошибка при получении данных:", error);
    bot.sendMessage(chatId, "⚠ Ошибка при получении данных.");
  }
});

// ⚙️ Обработчик кнопок меню
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

// Добавьте в обработчик callback_query
if (data === "my_equipment") {
  const userData = users[chatId];
  if (userData && userData.cncName) {
    bot.sendMessage(
      chatId,
      `🔧 Ваше оборудование:\n\nСтанок: ${userData.cncName}\n`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: "⬅ Назад", callback_data: "main_menu" }]],
        },
      }
    );
  } else {
    bot.sendMessage(
      chatId,
      "❌ Информация о вашем оборудовании отсутствует",
      {
        reply_markup: {
          inline_keyboard: [[{ text: "⬅ Назад", callback_data: "main_menu" }]],
        },
      }
    );
  }
}

  if (data === "services") {
    bot.sendMessage(chatId, "\ud83d\udce6 Выберите услугу:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "\ud83d\udc90 Заказ макета", callback_data: "order_design" }],
          [{ text: "\ud83d\udda5 Заказ написания программы", callback_data: "order_program" }],
          [{ text: "⬅ Назад", callback_data: "main_menu" }],
        ],
      },
    });
  } else if (data === "order_design") {
    orders[chatId] = { type: "Макет" };
    bot.sendMessage(chatId, "✍️ Опишите ваш заказ и прикрепите фото.");
  } else if (data === "order_program") {
    orders[chatId] = { type: "Программа" };
    bot.sendMessage(chatId, "✍️ Опишите ваш заказ.");
  } else if (data === "downloads") {
    try {
      const snapshot = await db.collection("learning_files").get();
      if (snapshot.empty) {
        bot.sendMessage(chatId, "📂 Нет доступных файлов для скачивания.");
        return;
      }
      let message = "📂 Доступные файлы:\n\n";
      snapshot.forEach((doc) => {
        const file = doc.data();
        const fileId = file.url.split("/d/")[1].split("/view")[0];
        const downloadUrl = `https://docs.google.com/document/d/${fileId}/export?format=pdf`;
        message += `📎 <b>${file.name}</b>\n🔗 <a href='${downloadUrl}'>Скачать</a>\n\n`;
      });
      bot.sendMessage(chatId, message, { parse_mode: "HTML" });
    } catch (error) {
      bot.sendMessage(chatId, "⚠ Ошибка при загрузке списка файлов.");
    }
  } else if (data === "main_menu") {
    sendMainMenu(chatId);
  }
});

// ⚙️ Обработка заявок от клиентов
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  if (orders[chatId]) {
    orders[chatId].details = msg.text;
    bot.sendMessage(chatId, "✅ Ваша заявка отправлена исполнителю. Ожидайте ответа.");
  }
});