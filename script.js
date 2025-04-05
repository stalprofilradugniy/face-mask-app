document.addEventListener('DOMContentLoaded', (event) => {

    // --- Получение ссылок на HTML элементы ---
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const loadingIndicator = document.getElementById('loading');
    const screenshotButton = document.getElementById('screenshot-button'); // Кнопка скриншота

    // Проверка наличия элементов
    if (!video || !canvas || !loadingIndicator || !screenshotButton) {
        console.error("Ошибка: Не найден один или несколько HTML элементов (video, canvas, loading, screenshot-button). Проверьте ID в HTML.");
        alert("Ошибка инициализации приложения. Не найдены необходимые элементы.");
        return;
    }

    const ctx = canvas.getContext('2d');

    // --- Переменные состояния ---
    let currentMaskType = 'none'; // 'glasses', 'crown', 'none'
    let currentMaskFullPath = null; // Полный путь к файлу маски
    let currentMaskImage = null;    // Объект Image для текущей маски
    const maskImages = {}; // Кэш для загруженных изображений масок (ключ - полный путь)
    let modelsLoaded = false;
    let videoReady = false;
    let maskChangeInterval = null; // ID для setInterval

    // --- Конфигурация типов масок (общая для типа) ---
    // Настройки scale и offsetY теперь применяются ко всем маскам одного типа
    const MASK_TYPE_CONFIG = {
        glasses: { scale: 1.25, offsetY: 0 }, // Увеличил scale для очков
        crown: { scale: 1.4, offsetY: -0.45 } // offsetY для нового расчета Y
    };

    // --- Списки файлов масок (УКАЖИТЕ ТОЧНЫЕ ИМЕНА ФАЙЛОВ В ПАПКАХ!) ---
    const AVAILABLE_MASKS = {
        glasses: [
            'glasses1.png',
            'glasses2.png',
            'glasses3.png'
            // Добавьте другие файлы из masks/glasses/ сюда
        ],
        crowns: [
            'crown1.png',
            'crown2.png',
            'crown3.png'
            // Добавьте другие файлы из masks/crowns/ сюда
        ]
        // 'none' обрабатывается отдельно
    };
    const MASK_TYPES = Object.keys(AVAILABLE_MASKS); // ['glasses', 'crowns']

    // --- Функция отображения/скрытия загрузчика ---
    function showLoading(message) {
        if (loadingIndicator) {
            loadingIndicator.innerText = message;
            loadingIndicator.classList.add('visible');
        }
         console.log(`Статус загрузки: ${message}`);
    }

    function hideLoading() {
        if (loadingIndicator) {
            loadingIndicator.classList.remove('visible');
        }
    }

    // --- Загрузка моделей face-api.js ---
    async function loadModels() {
        const MODEL_URL = './models'; // Папка models в корне репозитория
        showLoading("Загрузка моделей...");
        console.log(`Загрузка моделей из: ${MODEL_URL}`);
        try {
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL)
            ]);
            console.log("Модели face-api.js успешно загружены!");
            modelsLoaded = true;
            checkReadyAndStart();
        } catch (error) {
            console.error("!!! ОШИБКА загрузки моделей face-api.js:", error);
            showLoading("Ошибка загрузки моделей! Проверьте путь и наличие файлов.");
            alert(`Произошла ошибка при загрузке моделей: ${error.message}. Убедитесь, что папка 'models' существует и содержит нужные файлы.`);
        }
    }

    // --- Получение доступа к камере и настройка видео/холста ---
    async function startVideo() {
        showLoading("Запрос доступа к камере...");
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            video.srcObject = stream;
            console.log("Доступ к камере получен.");

            video.onloadedmetadata = () => {
                console.log("Метаданные видео загружены.");
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                console.log(`Размер Canvas: ${canvas.width}x${canvas.height}`);
                videoReady = true;
                checkReadyAndStart();
            };

            video.addEventListener('play', () => {
                console.log("Событие 'play' для видео.");
                 if (!videoReady && video.videoWidth > 0) { // Если loadedmetadata еще не сработало
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    videoReady = true;
                    console.log(`Размер Canvas установлен при 'play': ${canvas.width}x${canvas.height}`);
                    checkReadyAndStart();
                 } else if (videoReady) {
                     checkReadyAndStart(); // На случай, если событие play пришло позже
                 }
            });

        } catch (err) {
            console.error("!!! ОШИБКА доступа к камере:", err);
            showLoading("Ошибка доступа к камере!");
            alert(`Не удалось получить доступ к камере: ${err.name}. Убедитесь, что используется HTTPS и вы разрешили доступ.`);
        }
    }

    // --- Функция проверки готовности и запуска основного цикла ---
    function checkReadyAndStart() {
        if (modelsLoaded && videoReady) {
            console.log("Модели загружены и видео готово. Запуск!");
            hideLoading();
            // Запускаем случайную смену масок
            startRandomMaskChanges();
            // Запускаем цикл отрисовки
            requestAnimationFrame(detectAndDraw);
        } else {
             console.log(`Ожидание: Модели ${modelsLoaded ? 'OK' : 'Нет'}, Видео ${videoReady ? 'OK' : 'Нет'}`);
             if (!modelsLoaded) showLoading("Загрузка моделей...");
             else if (!videoReady) showLoading("Ожидание видео...");
        }
    }

    // --- Предзагрузка изображений масок из подпапок ---
    function preloadMaskImages() {
        console.log("Предзагрузка изображений масок...");
        let imagesToLoad = 0;
        let loadedCount = 0;

        // Считаем общее количество масок для загрузки
        MASK_TYPES.forEach(type => {
            imagesToLoad += AVAILABLE_MASKS[type].length;
        });
         // Добавляем 'none.png', если он есть
         const nonePngPath = './masks/none.png';
         imagesToLoad++; // Считаем его в любом случае

         console.log(`Всего масок для попытки загрузки: ${imagesToLoad}`);

        const checkAllLoaded = () => {
            loadedCount++;
            // console.log(`Загружено изображений: ${loadedCount}/${imagesToLoad}`);
            if (loadedCount === imagesToLoad) {
                console.log("Предзагрузка изображений масок завершена (или попытки загрузки).");
                // Можно установить начальную маску здесь, если нужно
                // setCurrentMask('none', './masks/none.png');
            }
        };

        // Загружаем маски из подпапок
        MASK_TYPES.forEach(type => { // type = 'glasses' или 'crowns'
            const folder = type; // Имя папки совпадает с ключом
            AVAILABLE_MASKS[type].forEach(filename => {
                const fullPath = `./masks/${folder}/${filename}`;
                const img = new Image();
                maskImages[fullPath] = img; // Ключ - ПОЛНЫЙ ПУТЬ

                img.onload = () => {
                    if (img.naturalHeight === 0) {
                        console.error(`Ошибка: Файл '${fullPath}' загружен, но некорректен.`);
                        maskImages[fullPath] = null; // Невалидный
                    }
                     checkAllLoaded();
                };
                img.onerror = () => {
                    console.error(`!!! ОШИБКА загрузки: ${fullPath}`);
                    maskImages[fullPath] = null; // Ошибка загрузки
                    checkAllLoaded();
                };
                img.src = fullPath;
                // console.log(`Загрузка: ${fullPath}`);
            });
        });

         // Загружаем 'none.png'
         const noneImg = new Image();
         maskImages[nonePngPath] = noneImg;
         noneImg.onload = () => { if (noneImg.naturalHeight === 0) maskImages[nonePngPath] = null; checkAllLoaded(); };
         noneImg.onerror = () => { console.error(`!!! ОШИБКА загрузки: ${nonePngPath}`); maskImages[nonePngPath] = null; checkAllLoaded(); };
         noneImg.src = nonePngPath;

         // На случай, если не было файлов для загрузки
         if (imagesToLoad === 0) {
             console.warn("Нет файлов масок для загрузки в AVAILABLE_MASKS.");
             checkAllLoaded();
         }
    }

    // --- Установка текущей маски ---
    function setCurrentMask(type, fullPath) {
        // Проверяем, есть ли изображение в кэше и валидно ли оно
        if (maskImages[fullPath] && maskImages[fullPath].complete && maskImages[fullPath].naturalHeight > 0) {
            currentMaskType = type; // 'glasses', 'crown', 'none'
            currentMaskFullPath = fullPath;
            currentMaskImage = maskImages[fullPath];
            console.log(`Маска установлена: ${type} - ${fullPath}`);
        } else {
             // Если запрошенная маска невалидна, устанавливаем 'none'
            console.warn(`Не удалось установить маску: ${fullPath}. Установка 'none'.`);
            currentMaskType = 'none';
            currentMaskFullPath = './masks/none.png';
            // Пытаемся использовать загруженный none.png, если он есть
            if (maskImages[currentMaskFullPath] && maskImages[currentMaskFullPath].complete && maskImages[currentMaskFullPath].naturalHeight > 0) {
                 currentMaskImage = maskImages[currentMaskFullPath];
            } else {
                 currentMaskImage = null; // Иначе маски не будет
            }
        }
    }

    // --- Функция случайной смены маски ---
    function changeMaskRandomly() {
        // 1. Выбираем тип маски случайно (включая 'none')
        const availableTypes = [...MASK_TYPES, 'none']; // ['glasses', 'crowns', 'none']
        const randomTypeKey = availableTypes[Math.floor(Math.random() * availableTypes.length)];

        if (randomTypeKey === 'none') {
            setCurrentMask('none', './masks/none.png');
            return;
        }

        // 2. Выбираем случайный файл из списка для этого типа
        const typeMasks = AVAILABLE_MASKS[randomTypeKey]; // Массив имен файлов
        if (!typeMasks || typeMasks.length === 0) {
             console.warn(`Нет доступных файлов для типа '${randomTypeKey}', устанавливаем 'none'.`);
             setCurrentMask('none', './masks/none.png');
             return;
        }
        const randomFilename = typeMasks[Math.floor(Math.random() * typeMasks.length)];
        const fullPath = `./masks/${randomTypeKey}/${randomFilename}`; // Строим путь

        // 3. Устанавливаем маску
        const actualType = randomTypeKey === 'crowns' ? 'crown' : 'glasses'; // Приводим к типу для конфига
        setCurrentMask(actualType, fullPath);
    }

    // --- Запуск/Остановка случайной смены масок ---
    function startRandomMaskChanges(intervalSeconds = 7) {
        console.log(`Запуск случайной смены масок каждые ${intervalSeconds} секунд.`);
        // Очищаем предыдущий интервал, если он был
        if (maskChangeInterval) {
            clearInterval(maskChangeInterval);
        }
        // Вызываем сразу для установки первой маски
        changeMaskRandomly();
        // Устанавливаем интервал
        maskChangeInterval = setInterval(changeMaskRandomly, intervalSeconds * 1000);
    }

    function stopRandomMaskChanges() {
         if (maskChangeInterval) {
            clearInterval(maskChangeInterval);
            maskChangeInterval = null;
            console.log("Случайная смена масок остановлена.");
        }
    }

    // --- Основной цикл распознавания и рисования ---
    async function detectAndDraw() {
        if (!modelsLoaded || !videoReady || video.paused || video.ended || video.readyState < 3) {
            requestAnimationFrame(detectAndDraw);
            return;
        }

        const detectionOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 320 });
        let detection = null;
        try {
            detection = await faceapi.detectSingleFace(video, detectionOptions).withFaceLandmarks(true);
        } catch (detectionError) {
            console.error("Ошибка при обнаружении лица:", detectionError);
            requestAnimationFrame(detectAndDraw);
            return;
        }

        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Рисуем маску
        if (detection && currentMaskType !== 'none' && currentMaskImage) {
            const landmarks = detection.landmarks;
            const typeConfig = MASK_TYPE_CONFIG[currentMaskType]; // Получаем конфиг для типа

            if (!typeConfig) {
                console.warn(`Нет конфига для типа маски: ${currentMaskType}`);
                requestAnimationFrame(detectAndDraw);
                return;
            }

            let x, y, width, height;

            try {
                const leftEyeBrow = landmarks.getLeftEyeBrow();
                const rightEyeBrow = landmarks.getRightEyeBrow();
                // Ширина между внешними краями бровей (используем для ОБОИХ типов)
                const browWidth = (rightEyeBrow[4].x - leftEyeBrow[0].x);
                width = browWidth * typeConfig.scale; // Масштаб из конфига типа
                height = width * (currentMaskImage.naturalHeight / currentMaskImage.naturalWidth); // Пропорциональная высота

                if (currentMaskType === 'glasses') {
                    // Центрируем по X относительно бровей
                    const browCenterX = (leftEyeBrow[0].x + rightEyeBrow[4].x) / 2;
                    x = browCenterX - width / 2;

                    // Позиционируем по Y относительно глаз
                    const leftEye = landmarks.getLeftEye();
                    const rightEye = landmarks.getRightEye();
                    const eyeCenterY = (leftEye[0].y + rightEye[3].y) / 2;
                    // Смещаем по Y относительно центра глаз + коррекция offsetY из конфига
                    y = eyeCenterY - height / 2 + height * typeConfig.offsetY;

                } else if (currentMaskType === 'crown') {
                     // Центрируем по X относительно бровей
                     const browCenterX = (leftEyeBrow[0].x + rightEyeBrow[4].x) / 2;
                     x = browCenterX - width / 2;

                    // Позиционируем по Y относительно линии бровей
                    const browMidTopY = (leftEyeBrow[2].y + rightEyeBrow[2].y) / 2;
                    // targetCenterY - желаемая Y-координата ЦЕНТРА короны
                    const targetCenterY = browMidTopY + (height * typeConfig.offsetY); // offsetY < 0 смещает вверх
                    // Координата верхнего края (y) = целевой центр минус половина высоты
                    y = targetCenterY - (height / 2);
                }

                // Рисуем, если координаты валидны
                if (x !== undefined && y !== undefined && width > 0 && height > 0 && !isNaN(x) && !isNaN(y) && !isNaN(width) && !isNaN(height)) {
                    if (x < canvas.width && y < canvas.height && x + width > 0 && y + height > 0) {
                        ctx.drawImage(currentMaskImage, x, y, width, height);
                    }
                }

            } catch (coordError) {
                console.error(`Ошибка при расчете координат маски '${currentMaskFullPath}':`, coordError);
            }
        }

        requestAnimationFrame(detectAndDraw);
    }

    // --- Функция скриншота ---
    function takeScreenshot() {
        try {
            // Убедимся, что на холсте что-то нарисовано (последний кадр)
             if (canvas.width > 0 && canvas.height > 0) {
                 const dataUrl = canvas.toDataURL('image/png'); // Получаем данные изображения
                 const link = document.createElement('a');
                 link.href = dataUrl;
                 link.download = `facemask_screenshot_${Date.now()}.png`; // Имя файла с меткой времени
                 document.body.appendChild(link); // Добавляем ссылку в DOM (нужно для Firefox)
                 link.click();                      // Имитируем клик для скачивания
                 document.body.removeChild(link); // Удаляем ссылку
                 console.log("Скриншот сохранен.");
             } else {
                console.warn("Невозможно сделать скриншот: холст пуст.");
                alert("Не удалось сделать скриншот. Возможно, камера еще не запустилась.");
             }
        } catch (e) {
            console.error("Ошибка при создании скриншота:", e);
            alert(`Ошибка при создании скриншота: ${e.message}`);
        }
    }

    // --- Добавление обработчика на кнопку скриншота ---
    if (screenshotButton) {
        screenshotButton.addEventListener('click', takeScreenshot);
    }

    // --- Инициализация приложения ---
    console.log("Запуск инициализации приложения...");
    preloadMaskImages(); // Начинаем предзагрузку масок
    loadModels();        // Начинаем загрузку моделей
    startVideo();        // Запрашиваем доступ к камере

}); // Конец DOMContentLoaded
