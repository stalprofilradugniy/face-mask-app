const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const loadingIndicator = document.getElementById('loading');
const controls = document.getElementById('controls');
const ctx = canvas.getContext('2d');

let currentMaskName = 'none'; // Имя текущей маски ('glasses1', 'crown2', 'none', etc.)
let currentMaskImage = null; // Объект Image для текущей маски
const maskImages = {}; // Кэш для загруженных изображений масок

const MASK_CONFIG = {
    // Названия файлов должны совпадать с теми, что в папке /masks/
    // и с data-mask в HTML кнопках
    glasses1: { type: 'glasses', file: 'glasses1.png', scale: 1.1, offsetY: 0 },
    glasses2: { type: 'glasses', file: 'glasses2.png', scale: 1.0, offsetY: 0 },
    glasses3: { type: 'glasses', file: 'glasses3.png', scale: 1.2, offsetY: 0.05 },
    crown1: { type: 'crown', file: 'crown1.png', scale: 1.3, offsetY: -0.8 },
    crown2: { type: 'crown', file: 'crown2.png', scale: 1.5, offsetY: -0.9 },
    crown3: { type: 'crown', file: 'crown3.png', scale: 1.4, offsetY: -0.85 },
    none: { type: 'none', file: 'none.png' } // Для кнопки "Без маски"
};

// --- Загрузка моделей face-api.js ---
async function loadModels() {
    // Указываем путь к папке с моделями ОТНОСИТЕЛЬНО КОРНЯ САЙТА
    // Для GitHub Pages это будет корень репозитория
    const MODEL_URL = './models';
    try {
        console.log("Загрузка моделей...");
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),      // Детектор лиц (быстрый)
            faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL) // Детектор ключевых точек (быстрый)
            // Можно добавить другие модели для эмоций, возраста и т.д., если нужно
            // await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
        ]);
        console.log("Модели загружены успешно!");
        loadingIndicator.style.display = 'none'; // Скрываем индикатор загрузки
        startVideo(); // Запускаем видео после загрузки моделей
    } catch (error) {
        console.error("Ошибка загрузки моделей:", error);
        loadingIndicator.innerText = "Ошибка загрузки моделей. Обновите страницу.";
    }
}

// --- Получение доступа к камере ---
async function startVideo() {
    try {
        console.log("Запрос доступа к камере...");
        const stream = await navigator.mediaDevices.getUserMedia({
             video: {
                // Запрашиваем фронтальную камеру (на мобильных)
                facingMode: 'user'
             }
        });
        video.srcObject = stream;
        console.log("Доступ к камере получен.");
        // Ждем, пока метаданные видео загрузятся, чтобы узнать размеры
        video.onloadedmetadata = () => {
            console.log("Метаданные видео загружены.");
            // Устанавливаем размер canvas равным реальному размеру видео
            // Это важно для правильного отображения
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            console.log(`Размер видео: ${canvas.width}x${canvas.height}`);
        };
    } catch (err) {
        console.error("Ошибка доступа к камере: ", err);
        alert("Не удалось получить доступ к камере. Проверьте разрешения в браузере и убедитесь, что используется HTTPS.");
        loadingIndicator.innerText = "Ошибка доступа к камере.";
        loadingIndicator.style.display = 'block';
    }
}

// --- Предзагрузка изображений масок ---
function preloadMaskImages() {
    console.log("Предзагрузка изображений масок...");
    let loadedCount = 0;
    const totalMasks = Object.keys(MASK_CONFIG).length;

    // Добавляем обработчик, чтобы отследить загрузку всех масок
    const checkAllLoaded = () => {
        loadedCount++;
        if (loadedCount === totalMasks) {
            console.log("Все маски предзагружены.");
            // Устанавливаем маску по умолчанию (если нужно)
            // setCurrentMask('none'); // Или любую другую
        }
    };

    for (const name in MASK_CONFIG) {
        const config = MASK_CONFIG[name];
        const img = new Image();
        img.onload = checkAllLoaded; // Вызываем при успешной загрузке
        img.onerror = () => { // Обработка ошибок загрузки маски
            console.error(`Ошибка загрузки маски: ${config.file}`);
            checkAllLoaded(); // Все равно считаем "загруженной", чтобы не блокировать процесс
        };
        // Путь к маскам ОТНОСИТЕЛЬНО КОРНЯ САЙТА
        img.src = `./masks/${config.file}`;
        maskImages[name] = img; // Сохраняем в кэш
    }
}

// --- Установка текущей маски ---
function setCurrentMask(name) {
    if (maskImages[name]) {
        currentMaskName = name;
        currentMaskImage = maskImages[name]; // Берем из кэша
        console.log(`Маска изменена на: ${name}`);
    } else {
        console.warn(`Маска с именем ${name} не найдена.`);
        currentMaskName = 'none';
        currentMaskImage = maskImages['none']; // Ставим "без маски" если запрошенная не найдена
    }
}

// --- Основной цикл распознавания и рисования ---
async function detectAndDraw() {
    // Проверяем, готово ли видео к обработке
    if (video.paused || video.ended || !faceapi.nets.tinyFaceDetector.params) {
        // Запрашиваем следующий кадр анимации, чтобы цикл продолжался
        requestAnimationFrame(detectAndDraw);
        return; // Выходим, если видео не готово или модели не загружены
    }

    // Настройки детектора лиц
    const detectionOptions = new faceapi.TinyFaceDetectorOptions({
        inputSize: 320 // Меньший размер = быстрее, но менее точно. 320 - хороший баланс
    });

    // Обнаруживаем ОДНО лицо (detectSingleFace) с ключевыми точками (withFaceLandmarks)
    const detection = await faceapi.detectSingleFace(video, detectionOptions).withFaceLandmarks(true); // true для tiny landmark модели

    // Очищаем предыдущий кадр на холсте
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Рисуем текущий кадр видео на холст
    // Важно: используем размеры canvas, которые мы установили равными videoWidth/videoHeight
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Если лицо обнаружено и выбрана маска (не 'none')
    if (detection && currentMaskName !== 'none' && currentMaskImage && currentMaskImage.complete) {
        const landmarks = detection.landmarks;
        const maskConfig = MASK_CONFIG[currentMaskName];

        // --- Расчет позиции и размера маски ---
        let x, y, width, height;

        if (maskConfig.type === 'glasses') {
            // Очки: позиционируем по глазам
            const leftEye = landmarks.getLeftEye();
            const rightEye = landmarks.getRightEye();

            // Центр между глазами
            const eyeCenter = {
                x: (leftEye[0].x + rightEye[3].x) / 2,
                y: (leftEye[0].y + rightEye[3].y) / 2
            };

            // Ширина маски - расстояние между внешними уголками глаз + небольшой запас
            width = (rightEye[3].x - leftEye[0].x) * maskConfig.scale;
             // Высоту делаем пропорциональной ширине на основе исходных размеров картинки маски
            height = width * (currentMaskImage.naturalHeight / currentMaskImage.naturalWidth);

            // Позиция (верхний левый угол)
            x = eyeCenter.x - width / 2;
            y = eyeCenter.y - height / 2 + height * maskConfig.offsetY; // Небольшая вертикальная коррекция

        } else if (maskConfig.type === 'crown') {
            // Корона: позиционируем по бровям/лбу
            const leftEyeBrow = landmarks.getLeftEyeBrow();
            const rightEyeBrow = landmarks.getRightEyeBrow();
            const nose = landmarks.getNose(); // Используем нос для вертикального позиционирования

            // Центр между бровями
            const browCenter = {
                x: (leftEyeBrow[0].x + rightEyeBrow[4].x) / 2,
                y: (leftEyeBrow[2].y + rightEyeBrow[2].y) / 2 // Примерно верхняя точка бровей
            };

             // Ширина маски - расстояние между внешними краями бровей + запас
            width = (rightEyeBrow[4].x - leftEyeBrow[0].x) * maskConfig.scale;
             // Высота пропорционально
            height = width * (currentMaskImage.naturalHeight / currentMaskImage.naturalWidth);

            // Позиция (верхний левый угол)
            x = browCenter.x - width / 2;
            // Размещаем ВЫШЕ бровей, используя offsetY как множитель высоты короны
            y = browCenter.y + height * maskConfig.offsetY - height; // offsetY < 0, поэтому вычитаем
        }

        // Рисуем маску, если координаты рассчитаны
        if (x !== undefined && y !== undefined && width > 0 && height > 0) {
            ctx.drawImage(currentMaskImage, x, y, width, height);
        }
    }

    // Запрашиваем следующий кадр анимации для плавности
    requestAnimationFrame(detectAndDraw);
}

// --- Добавление обработчиков событий на кнопки ---
controls.addEventListener('click', (event) => {
    if (event.target.tagName === 'BUTTON') {
        const maskName = event.target.getAttribute('data-mask');
        if (maskName) {
            setCurrentMask(maskName);
        }
    }
});


// --- Инициализация ---
// Ждем, когда видео начнет проигрываться, чтобы запустить цикл детекции
video.addEventListener('play', () => {
    console.log("Видео начало проигрываться. Запускаем цикл детекции.");
    // Убедимся, что размеры canvas установлены перед первым запуском detectAndDraw
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
         canvas.width = video.videoWidth;
         canvas.height = video.videoHeight;
         console.log(`Размер canvas обновлен: ${canvas.width}x${canvas.height}`);
    }
    // Используем requestAnimationFrame для более плавного цикла
    requestAnimationFrame(detectAndDraw);
});

// --- Старт приложения ---
preloadMaskImages(); // Начинаем загрузку масок
loadModels(); // Начинаем загрузку моделей face-api