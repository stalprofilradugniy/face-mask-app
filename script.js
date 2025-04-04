// --- Получение ссылок на HTML элементы ---
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const loadingIndicator = document.getElementById('loading');
// Получаем ОБА блока управления по их ID из HTML
const glassesControls = document.getElementById('glasses-controls');
const otherControls = document.getElementById('other-controls');
const ctx = canvas.getContext('2d');

// --- Переменные состояния ---
let currentMaskName = 'none'; // Имя текущей маски ('glasses1', 'crown2', 'none', etc.)
let currentMaskImage = null; // Объект Image для текущей маски
const maskImages = {}; // Кэш для загруженных изображений масок

// --- Конфигурация масок ---
const MASK_CONFIG = {
    // Очки
    glasses1: { type: 'glasses', file: 'glasses1.png', scale: 1.1, offsetY: 0 },
    glasses2: { type: 'glasses', file: 'glasses2.png', scale: 1.0, offsetY: 0 },
    glasses3: { type: 'glasses', file: 'glasses3.png', scale: 1.2, offsetY: 0.05 }, // Небольшое смещение вниз, если нужно

    // Короны (СКОРРЕКТИРОВАННЫЕ offsetY для нового расчета Y)
    // Значение offsetY теперь определяет положение ЦЕНТРА короны
    // относительно линии бровей (как доля высоты короны).
    // Отрицательное значение = ВЫШЕ бровей.
    crown1: { type: 'crown', file: 'crown1.png', scale: 1.3, offsetY: -0.4 }, // Центр на 40% высоты выше бровей
    crown2: { type: 'crown', file: 'crown2.png', scale: 1.5, offsetY: -0.5 }, // Центр на 50% высоты выше бровей
    crown3: { type: 'crown', file: 'crown3.png', scale: 1.4, offsetY: -0.45 },// Центр на 45% высоты выше бровей

    // Без маски
    none: { type: 'none', file: 'none.png' } // Используем пустой/прозрачный png
};

// --- Загрузка моделей face-api.js ---
async function loadModels() {
    // Путь к папке с моделями ОТНОСИТЕЛЬНО КОРНЯ САЙТА
    const MODEL_URL = './models'; // Для GitHub Pages это корень репозитория
    try {
        console.log("Загрузка моделей...");
        loadingIndicator.style.display = 'block'; // Показываем индикатор
        loadingIndicator.innerText = "Загрузка моделей...";
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),      // Детектор лиц (быстрый)
            faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL) // Детектор ключевых точек (быстрый)
        ]);
        console.log("Модели загружены успешно!");
        loadingIndicator.style.display = 'none'; // Скрываем индикатор загрузки
        startVideo(); // Запускаем видео после загрузки моделей
    } catch (error) {
        console.error("Ошибка загрузки моделей:", error);
        loadingIndicator.innerText = "Ошибка загрузки моделей. Обновите страницу.";
        loadingIndicator.style.display = 'block'; // Оставляем сообщение об ошибке
    }
}

// --- Получение доступа к камере и настройка видео/холста ---
async function startVideo() {
    try {
        console.log("Запрос доступа к камере...");
        loadingIndicator.style.display = 'block';
        loadingIndicator.innerText = "Запрос доступа к камере...";
        const stream = await navigator.mediaDevices.getUserMedia({
             video: {
                facingMode: 'user'
                // Можно не указывать width/height, чтобы браузер выбрал оптимальные
                // width: { ideal: 640 },
                // height: { ideal: 480 }
             }
        });
        video.srcObject = stream;
        console.log("Доступ к камере получен.");
        loadingIndicator.style.display = 'none'; // Скрываем после получения доступа

        // ВАЖНО: Установка размеров CANVAS по РЕАЛЬНЫМ размерам видео
        video.onloadedmetadata = () => {
            console.log("Метаданные видео загружены.");
            // Устанавливаем РАЗМЕРЫ ДЛЯ РИСОВАНИЯ на canvas
            // равными реальному размеру видеопотока для правильных пропорций
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            console.log(`Размер Canvas для рисования установлен: ${canvas.width}x${canvas.height}`);
            // CSS позаботится об отображаемом размере холста (width/height: 100%)
        };

        // Запускаем цикл детекции, когда видео начнет проигрываться
        video.addEventListener('play', () => {
            console.log("Видео начало проигрываться. Запускаем цикл детекции.");
            // Дополнительная проверка размеров на случай, если 'play' сработает раньше 'loadedmetadata'
            if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                 canvas.width = video.videoWidth;
                 canvas.height = video.videoHeight;
                 console.log(`Размер canvas уточнен при 'play': ${canvas.width}x${canvas.height}`);
            }
            requestAnimationFrame(detectAndDraw); // Начинаем цикл
        });

    } catch (err) {
        console.error("Ошибка доступа к камере: ", err);
        alert("Не удалось получить доступ к камере. Убедитесь, что вы разрешили доступ и используется HTTPS.");
        loadingIndicator.innerText = "Ошибка доступа к камере.";
        loadingIndicator.style.display = 'block';
    }
}

// --- Предзагрузка изображений масок ---
function preloadMaskImages() {
    console.log("Предзагрузка изображений масок...");
    let loadedCount = 0;
    const totalMasks = Object.keys(MASK_CONFIG).length;

    const checkAllLoaded = () => {
        loadedCount++;
        if (loadedCount === totalMasks) {
            console.log("Все маски предзагружены.");
            // Устанавливаем маску по умолчанию (без маски)
            setCurrentMask('none');
        }
    };

    for (const name in MASK_CONFIG) {
        const config = MASK_CONFIG[name];
        if (!config.file) { // Пропускаем, если у маски нет файла (на всякий случай)
            checkAllLoaded();
            continue;
        }
        const img = new Image();
        img.onload = checkAllLoaded;
        img.onerror = () => {
            console.error(`Ошибка загрузки маски: ${config.file}`);
            // Можно установить "битую" картинку или просто игнорировать
            maskImages[name] = null; // Помечаем, что загрузка не удалась
            checkAllLoaded();
        };
        // Путь к маскам ОТНОСИТЕЛЬНО КОРНЯ САЙТА
        img.src = `./masks/${config.file}`;
        maskImages[name] = img; // Сохраняем в кэш
    }
}

// --- Установка текущей маски ---
function setCurrentMask(name) {
    // Проверяем, существует ли конфиг и успешно ли загружено изображение
    if (MASK_CONFIG[name] && maskImages[name] && maskImages[name].complete && maskImages[name].naturalHeight !== 0) {
        currentMaskName = name;
        currentMaskImage = maskImages[name]; // Берем из кэша
        console.log(`Маска изменена на: ${name}`);
    } else if (name === 'none' && maskImages['none']) { // Обработка случая 'none'
         currentMaskName = 'none';
         currentMaskImage = maskImages['none']; // Может быть пустым изображением
         console.log(`Маска изменена на: ${name}`);
    }
    else {
        console.warn(`Маска с именем '${name}' не найдена или не загружена. Устанавливаем 'none'.`);
        currentMaskName = 'none';
        currentMaskImage = maskImages['none']; // Возвращаемся к "без маски"
    }
}

// --- Основной цикл распознавания и рисования ---
async function detectAndDraw() {
    // Проверяем, готово ли видео к обработке и загружены ли модели
    if (video.paused || video.ended || !faceapi.nets.tinyFaceDetector.params || video.readyState < 3) {
        requestAnimationFrame(detectAndDraw); // Продолжаем цикл ожидания
        return;
    }

    // Настройки детектора лиц
    const detectionOptions = new faceapi.TinyFaceDetectorOptions({
        inputSize: 320 // Уменьшение может ускорить, но снизить точность
    });

    // Обнаруживаем ОДНО лицо с ключевыми точками
    const detection = await faceapi.detectSingleFace(video, detectionOptions).withFaceLandmarks(true); // true для tiny landmark модели

    // Очищаем предыдущий кадр на холсте
    // Важно использовать размеры canvas, которые соответствуют videoWidth/videoHeight
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Рисуем текущий кадр видео на холст
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Если лицо обнаружено и выбрана маска (не 'none') и изображение маски готово
    if (detection && currentMaskName !== 'none' && currentMaskImage && currentMaskImage.complete && currentMaskImage.naturalHeight !== 0) {
        const landmarks = detection.landmarks;
        const maskConfig = MASK_CONFIG[currentMaskName];

        // --- Расчет позиции и размера маски ---
        let x, y, width, height;

        if (maskConfig.type === 'glasses') {
            // Очки: позиционируем по глазам
            const leftEye = landmarks.getLeftEye();     // Левый глаз (с точки зрения пользователя)
            const rightEye = landmarks.getRightEye();   // Правый глаз (с точки зрения пользователя)
            const leftPoint = leftEye[0];               // Внешний уголок левого глаза
            const rightPoint = rightEye[3];             // Внешний уголок правого глаза

            // Центр между внешними уголками глаз
            const eyeCenter = {
                x: (leftPoint.x + rightPoint.x) / 2,
                y: (leftPoint.y + rightPoint.y) / 2
            };

            // Ширина маски - расстояние между внешними уголками глаз + масштаб
            width = (rightPoint.x - leftPoint.x) * maskConfig.scale;
             // Высоту делаем пропорциональной ширине
            height = width * (currentMaskImage.naturalHeight / currentMaskImage.naturalWidth);

            // Позиция (верхний левый угол)
            x = eyeCenter.x - width / 2;
            // Смещаем по Y относительно центра глаз + коррекция offsetY
            y = eyeCenter.y - height / 2 + height * maskConfig.offsetY;

        } else if (maskConfig.type === 'crown') {
            // Корона: позиционируем по бровям
            const leftEyeBrow = landmarks.getLeftEyeBrow();
            const rightEyeBrow = landmarks.getRightEyeBrow();
            const leftPoint = leftEyeBrow[0];    // Внешний край левой брови
            const rightPoint = rightEyeBrow[4];  // Внешний край правой брови
            // Точка над переносицей (между бровями) как вертикальный ориентир
            const browMidTopY = (leftEyeBrow[2].y + rightEyeBrow[2].y) / 2;

            // Центр между внешними краями бровей (для X)
            const browCenterX = (leftPoint.x + rightPoint.x) / 2;

             // Ширина маски - расстояние между внешними краями бровей + масштаб
            width = (rightPoint.x - leftPoint.x) * maskConfig.scale;
             // Высота пропорционально
            height = width * (currentMaskImage.naturalHeight / currentMaskImage.naturalWidth);

            // Позиция X (центр короны над центром бровей)
            x = browCenterX - width / 2;

            // --- НОВЫЙ РАСЧЕТ ПОЗИЦИИ Y (для корон) ---
            // offsetY определяет смещение ЦЕНТРА короны относительно линии бровей.
            // Отрицательное значение смещает центр ВЫШЕ линии бровей.
            // targetCenterY - желаемая Y-координата ЦЕНТРА короны
            const targetCenterY = browMidTopY + (height * maskConfig.offsetY);

            // Координата верхнего края (y) = целевой центр минус половина высоты
            y = targetCenterY - (height / 2);
            // --- КОНЕЦ НОВОГО РАСЧЕТА Y ---
        }

        // Рисуем маску, если координаты рассчитаны и маска в пределах видимости
        if (x !== undefined && y !== undefined && width > 0 && height > 0) {
             // Опциональная проверка: не рисовать слишком далеко за пределами холста
             if (x < canvas.width && y < canvas.height && x + width > 0 && y + height > 0) {
                 ctx.drawImage(currentMaskImage, x, y, width, height);
             }
        }
    } else if (detection && currentMaskName !== 'none') {
        // Если маска выбрана, но изображение еще не загрузилось или битое
        // console.log(`Ожидание загрузки изображения для маски: ${currentMaskName}`);
    }

    // Запрашиваем следующий кадр анимации
    requestAnimationFrame(detectAndDraw);
}

// --- ЕДИНЫЙ обработчик кликов по кнопкам масок ---
function handleMaskButtonClick(event) {
    // Проверяем, что клик был именно по кнопке и у нее есть атрибут data-mask
    if (event.target.tagName === 'BUTTON' && event.target.dataset.mask) {
        const maskName = event.target.dataset.mask;
        setCurrentMask(maskName);
    }
}

// --- Добавление обработчиков событий на ОБА блока управления ---
if (glassesControls) {
    glassesControls.addEventListener('click', handleMaskButtonClick);
} else {
    console.error("Элемент #glasses-controls не найден в HTML!");
}

if (otherControls) {
    otherControls.addEventListener('click', handleMaskButtonClick);
} else {
    console.error("Элемент #other-controls не найден в HTML!"); // Убедись, что ID совпадает с HTML
}


// --- Инициализация приложения ---
console.log("Инициализация приложения...");
preloadMaskImages(); // Начинаем предзагрузку масок
loadModels(); // Начинаем загрузку моделей face-api (она вызовет startVideo)
