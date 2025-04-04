// Убедимся, что скрипт выполняется только после загрузки DOM
document.addEventListener('DOMContentLoaded', (event) => {

    // --- Получение ссылок на HTML элементы ---
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const loadingIndicator = document.getElementById('loading');
    const glassesControls = document.getElementById('glasses-controls');
    const otherControls = document.getElementById('other-controls');

    // Проверка наличия элементов (важно для отладки)
    if (!video || !canvas || !loadingIndicator || !glassesControls || !otherControls) {
        console.error("Ошибка: Не найден один или несколько HTML элементов (video, canvas, loading, glasses-controls, other-controls). Проверьте ID в HTML.");
        alert("Ошибка инициализации приложения. Не найдены необходимые элементы.");
        return; // Прерываем выполнение скрипта
    }

    const ctx = canvas.getContext('2d');

    // --- Переменные состояния ---
    let currentMaskName = 'none';
    let currentMaskImage = null;
    const maskImages = {};
    let modelsLoaded = false; // Флаг для отслеживания загрузки моделей
    let videoReady = false;   // Флаг для отслеживания готовности видео

    // --- Конфигурация масок ---
    const MASK_CONFIG = {
        glasses1: { type: 'glasses', file: 'glasses1.png', scale: 1.1, offsetY: 0 },
        glasses2: { type: 'glasses', file: 'glasses2.png', scale: 1.0, offsetY: 0 },
        glasses3: { type: 'glasses', file: 'glasses3.png', scale: 1.2, offsetY: 0.05 },
        crown1: { type: 'crown', file: 'crown1.png', scale: 1.3, offsetY: -0.4 },
        crown2: { type: 'crown', file: 'crown2.png', scale: 1.5, offsetY: -0.5 },
        crown3: { type: 'crown', file: 'crown3.png', scale: 1.4, offsetY: -0.45 },
        none: { type: 'none', file: 'none.png' } // Должен быть пустой/прозрачный PNG
    };

    // --- Функция отображения/скрытия загрузчика ---
    function showLoading(message) {
        if (loadingIndicator) {
            loadingIndicator.innerText = message;
            loadingIndicator.classList.add('visible'); // Используем класс для показа
        }
         console.log(`Статус загрузки: ${message}`); // Логируем статус
    }

    function hideLoading() {
        if (loadingIndicator) {
            loadingIndicator.classList.remove('visible'); // Скрываем через класс
        }
    }

    // --- Загрузка моделей face-api.js ---
    async function loadModels() {
        // Абсолютный путь к моделям от корня репозитория на GitHub Pages
        // Или относительный './models', если папка models лежит рядом с index.html
        const MODEL_URL = './models'; // Убедитесь, что папка 'models' в корне репозитория!

        showLoading("Загрузка моделей...");
        console.log(`Загрузка моделей из: ${MODEL_URL}`);

        try {
            // Используем Promise.all для параллельной загрузки
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL)
            ]);
            console.log("Модели face-api.js успешно загружены!");
            modelsLoaded = true;
            // Не скрываем загрузчик здесь, ждем готовности видео
            checkReadyAndStart(); // Проверяем, можно ли стартовать основной цикл
        } catch (error) {
            console.error("!!! ОШИБКА загрузки моделей face-api.js:", error);
            showLoading("Ошибка загрузки моделей! Проверьте путь и наличие файлов в папке /models. Обновите страницу (F5).");
            // Здесь можно добавить более детальное сообщение об ошибке
            if (error.message.includes('404')) {
                alert("Не удалось загрузить файлы моделей (ошибка 404). Убедитесь, что папка 'models' с файлами моделей находится в корне репозитория на GitHub и путь в script.js указан верно.");
            } else {
                alert(`Произошла ошибка при загрузке моделей: ${error.message}`);
            }
        }
    }

    // --- Получение доступа к камере и настройка видео/холста ---
    async function startVideo() {
        showLoading("Запрос доступа к камере...");
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user'
                    // Можно попробовать запросить конкретное разрешение, если стандартное не подходит
                    // width: { ideal: 640 },
                    // height: { ideal: 480 }
                }
            });
            video.srcObject = stream;
            console.log("Доступ к камере получен.");

            // Важно дождаться события 'loadedmetadata', чтобы узнать реальные размеры видео
            video.onloadedmetadata = () => {
                console.log("Метаданные видео загружены.");
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                console.log(`Размер Canvas для рисования установлен: ${canvas.width}x${canvas.height}`);
                videoReady = true; // Видео готово к обработке
                checkReadyAndStart(); // Проверяем, можно ли стартовать основной цикл
            };

             // Обработчик 'play' для дополнительной надежности (если autoplay сработает)
             video.addEventListener('play', () => {
                console.log("Событие 'play' для видео.");
                // Убедимся, что размеры холста установлены правильно
                if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                     console.log(`Размер canvas уточнен при 'play': ${canvas.width}x${canvas.height}`);
                }
                videoReady = true; // Подтверждаем готовность
                checkReadyAndStart();
             });


        } catch (err) {
            console.error("!!! ОШИБКА доступа к камере:", err);
            showLoading("Ошибка доступа к камере!");
            if (err.name === "NotAllowedError") {
                alert("Вы не разрешили доступ к камере. Пожалуйста, разрешите доступ в настройках браузера и обновите страницу.");
            } else if (err.name === "NotFoundError") {
                 alert("Камера не найдена. Убедитесь, что камера подключена и работает.");
            } else {
                alert(`Не удалось получить доступ к камере: ${err.name}. Убедитесь, что используется HTTPS.`);
            }
        }
    }

     // --- Функция проверки готовности и запуска основного цикла ---
     function checkReadyAndStart() {
        // Запускаем основной цикл ТОЛЬКО если и модели загружены, И видео готово
        if (modelsLoaded && videoReady) {
            console.log("Модели загружены и видео готово. Запускаем detectAndDraw().");
            hideLoading(); // Скрываем индикатор загрузки
            requestAnimationFrame(detectAndDraw); // Начинаем цикл обработки кадров
        } else {
            console.log(`Ожидание готовности: Модели ${modelsLoaded ? 'ЗАГРУЖЕНЫ' : 'НЕ загружены'}, Видео ${videoReady ? 'ГОТОВО' : 'НЕ готово'}`);
            // Показываем актуальный статус, если что-то еще не готово
            if (!modelsLoaded) showLoading("Загрузка моделей...");
            else if (!videoReady) showLoading("Ожидание видео...");
        }
    }


    // --- Предзагрузка изображений масок ---
    function preloadMaskImages() {
        console.log("Предзагрузка изображений масок...");
        let loadedCount = 0;
        const maskKeys = Object.keys(MASK_CONFIG);
        const totalMasks = maskKeys.length;

        if (totalMasks === 0) {
            console.warn("Нет масок для предзагрузки в MASK_CONFIG.");
            return;
        }

        const checkAllLoaded = () => {
            loadedCount++;
            // console.log(`Загружено масок: ${loadedCount}/${totalMasks}`);
            if (loadedCount === totalMasks) {
                console.log("Все изображения масок (или попытки загрузки) завершены.");
                // Устанавливаем маску по умолчанию после загрузки всех
                setCurrentMask('none');
            }
        };

        maskKeys.forEach(name => {
            const config = MASK_CONFIG[name];
            if (!config.file) {
                console.warn(`Маска '${name}' не имеет файла для загрузки.`);
                loadedCount++; // Считаем как "загруженную", чтобы не блокировать
                return;
            }

            const img = new Image();
            maskImages[name] = img; // Сразу добавляем в кэш

            img.onload = () => {
                // console.log(`Маска загружена: ${config.file}`);
                if (img.naturalHeight === 0) {
                    console.error(`Ошибка: Файл маски '${config.file}' загружен, но является некорректным изображением (высота 0).`);
                    maskImages[name] = null; // Помечаем как невалидную
                }
                checkAllLoaded();
            };
            img.onerror = () => {
                console.error(`!!! ОШИБКА загрузки изображения маски: ${config.file}`);
                maskImages[name] = null; // Помечаем, что загрузка не удалась
                checkAllLoaded();
            };
            // Путь к маскам ОТНОСИТЕЛЬНО index.html
            img.src = `./masks/${config.file}`;
            // console.log(`Начинаем загрузку: ${img.src}`);
        });

        // На случай, если MASK_CONFIG пуст (хотя мы проверили выше)
        if (totalMasks === loadedCount) {
             console.log("Все изображения масок (или попытки загрузки) завершены (сценарий без файлов).");
             setCurrentMask('none');
        }
    }

    // --- Установка текущей маски ---
    function setCurrentMask(name) {
        const config = MASK_CONFIG[name];
        // Проверяем, есть ли конфиг, есть ли запись в кэше, и является ли она валидным загруженным изображением
        if (config && maskImages[name] && maskImages[name].complete && maskImages[name].naturalHeight > 0) {
            currentMaskName = name;
            currentMaskImage = maskImages[name];
            console.log(`Маска изменена на: ${name}`);
        } else {
            // Если запрошенная маска невалидна или это 'none' без картинки, ставим 'none'
            console.warn(`Маска '${name}' не найдена, не загружена или некорректна. Устанавливаем 'none'.`);
            currentMaskName = 'none';
            // Пытаемся использовать заглушку 'none.png', если она есть и загружена
            if (maskImages['none'] && maskImages['none'].complete && maskImages['none'].naturalHeight > 0) {
                 currentMaskImage = maskImages['none'];
            } else {
                 currentMaskImage = null; // Иначе маски не будет
            }
        }
    }

    // --- Основной цикл распознавания и рисования ---
    async function detectAndDraw() {
        // Проверяем готовность перед каждой итерацией
        if (!modelsLoaded || !videoReady || video.paused || video.ended || video.readyState < 3) {
             // Если не готовы, продолжаем запрашивать кадр, но ничего не делаем
             requestAnimationFrame(detectAndDraw);
             return;
        }

        // Настройки детектора
        const detectionOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 320 });

        // Обнаружение лица и точек
        let detection = null; // Объявляем переменную здесь
        try {
             detection = await faceapi.detectSingleFace(video, detectionOptions).withFaceLandmarks(true);
        } catch(detectionError){
             console.error("Ошибка при обнаружении лица:", detectionError);
             // Можно добавить логику обработки ошибки обнаружения, если нужно
             requestAnimationFrame(detectAndDraw); // Продолжаем цикл
             return;
        }


        // Очистка и рисование видео
        // Убедимся, что размеры canvas актуальны (на случай редких изменений)
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Рисование маски, если лицо найдено и маска выбрана/загружена
        if (detection && currentMaskName !== 'none' && currentMaskImage) {
            const landmarks = detection.landmarks;
            const maskConfig = MASK_CONFIG[currentMaskName];

            if (!maskConfig) { // Доп. проверка на случай, если конфиг пропал
                 requestAnimationFrame(detectAndDraw);
                 return;
            }

            let x, y, width, height;

            try { // Обернем расчет координат в try...catch на всякий случай
                if (maskConfig.type === 'glasses') {
                    const leftEye = landmarks.getLeftEye();
                    const rightEye = landmarks.getRightEye();
                    const leftPoint = leftEye[0];
                    const rightPoint = rightEye[3];
                    const eyeCenter = { x: (leftPoint.x + rightPoint.x) / 2, y: (leftPoint.y + rightPoint.y) / 2 };
                    width = (rightPoint.x - leftPoint.x) * maskConfig.scale;
                    height = width * (currentMaskImage.naturalHeight / currentMaskImage.naturalWidth);
                    x = eyeCenter.x - width / 2;
                    y = eyeCenter.y - height / 2 + height * maskConfig.offsetY;

                } else if (maskConfig.type === 'crown') {
                    const leftEyeBrow = landmarks.getLeftEyeBrow();
                    const rightEyeBrow = landmarks.getRightEyeBrow();
                    const leftPoint = leftEyeBrow[0];
                    const rightPoint = rightEyeBrow[4];
                    const browMidTopY = (leftEyeBrow[2].y + rightEyeBrow[2].y) / 2;
                    const browCenterX = (leftPoint.x + rightPoint.x) / 2;
                    width = (rightPoint.x - leftPoint.x) * maskConfig.scale;
                    height = width * (currentMaskImage.naturalHeight / currentMaskImage.naturalWidth);
                    x = browCenterX - width / 2;
                    const targetCenterY = browMidTopY + (height * maskConfig.offsetY); // offsetY < 0 смещает вверх
                    y = targetCenterY - (height / 2);
                }

                // Рисуем маску, если координаты валидны
                if (x !== undefined && y !== undefined && width > 0 && height > 0 && !isNaN(x) && !isNaN(y) && !isNaN(width) && !isNaN(height)) {
                    // Опциональная проверка: не рисовать за пределами холста
                     if (x < canvas.width && y < canvas.height && x + width > 0 && y + height > 0) {
                        ctx.drawImage(currentMaskImage, x, y, width, height);
                     }
                } else {
                     // console.warn(`Не удалось рассчитать валидные координаты для маски ${currentMaskName}`);
                }

            } catch (coordError) {
                console.error(`Ошибка при расчете координат маски '${currentMaskName}':`, coordError);
                // Можно сбросить маску или просто пропустить кадр
                // setCurrentMask('none');
            }
        } else if (detection && currentMaskName !== 'none' && !currentMaskImage) {
            // console.log(`Ожидание/ошибка загрузки изображения для маски: ${currentMaskName}`);
        }

        // Запрашиваем следующий кадр
        requestAnimationFrame(detectAndDraw);
    }

    // --- ЕДИНЫЙ обработчик кликов по кнопкам масок ---
    function handleMaskButtonClick(event) {
        if (event.target.tagName === 'BUTTON' && event.target.dataset.mask) {
            const maskName = event.target.dataset.mask;
            setCurrentMask(maskName);
        }
    }

    // --- Добавление обработчиков событий на ОБА блока управления ---
    if (glassesControls) {
        glassesControls.addEventListener('click', handleMaskButtonClick);
    }
    if (otherControls) {
        otherControls.addEventListener('click', handleMaskButtonClick);
    }

    // --- Инициализация приложения ---
    console.log("Запуск инициализации приложения...");
    preloadMaskImages(); // Начинаем предзагрузку масок
    loadModels(); // Начинаем загрузку моделей face-api
    startVideo(); // Запрашиваем доступ к камере параллельно с загрузкой моделей
                 // Основной цикл запустится только когда ОБА процесса завершатся (в checkReadyAndStart)

}); // Конец обработчика DOMContentLoaded
