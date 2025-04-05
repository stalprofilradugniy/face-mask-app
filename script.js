// УДАЛИЛИ СТРОКУ: import faceapi from 'face-api.js';

document.addEventListener('DOMContentLoaded', (event) => {

    // --- Получение ссылок на HTML элементы ---
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const loadingIndicator = document.getElementById('loading');
    const screenshotButton = document.getElementById('screenshot-button');
    const changeMaskButton = document.getElementById('change-mask-button'); // Получаем новую кнопку

    // Проверка наличия всех элементов
    if (!video || !canvas || !loadingIndicator || !screenshotButton || !changeMaskButton) {
        console.error("Ошибка: Не найден один или несколько HTML элементов (video, canvas, loading, screenshot-button, change-mask-button).");
        alert("Ошибка инициализации приложения. Не найдены необходимые элементы.");
        return;
    }

    const ctx = canvas.getContext('2d');

    // --- Переменные состояния ---
    let currentMaskType = 'none';
    let currentMaskFullPath = null;
    let currentMaskImage = null;
    const maskImages = {};
    let modelsLoaded = false;
    let videoReady = false;

    // --- Конфигурация типов масок ---
    const MASK_TYPE_CONFIG = {
        glasses: { scale: 1.25, offsetY: 0 },
        crown: { scale: 1.4, offsetY: -0.45 }
    };

    // --- Списки файлов масок ---
    // УБЕДИСЬ, ЧТО ЭТИ ИМЕНА СОВПАДАЮТ С ФАЙЛАМИ В ПАПКАХ masks/glasses и masks/crowns
    const AVAILABLE_MASKS = {
        glasses: [ 'glasses1.png', 'glasses2.png', 'glasses3.png' ],
        crowns: [ 'crown1.png', 'crown2.png', 'crown3.png' ]
    };
    const MASK_TYPES = Object.keys(AVAILABLE_MASKS);

    // --- Функции загрузки, старта видео, проверки готовности ---
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

    async function loadModels() {
        const MODEL_URL = './models'; // Путь к папке с моделями
        showLoading("Загрузка моделей...");
        console.log(`Загрузка моделей из: ${MODEL_URL}`);
        try {
            // Используем глобальный объект faceapi, загруженный из CDN
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL)
            ]);
            console.log("Модели face-api.js успешно загружены!");
            modelsLoaded = true;
            checkReadyAndStart();
        } catch (error) {
            console.error("!!! ОШИБКА загрузки моделей face-api.js:", error);
            showLoading("Ошибка загрузки моделей!");
            alert(`Произошла ошибка при загрузке моделей: ${error.message}. Проверьте папку /models.`);
        }
    }

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
                 if (!videoReady && video.videoWidth > 0) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    videoReady = true;
                    console.log(`Размер Canvas установлен при 'play': ${canvas.width}x${canvas.height}`);
                    checkReadyAndStart();
                 } else if (videoReady) {
                     checkReadyAndStart();
                 }
            });

        } catch (err) {
            console.error("!!! ОШИБКА доступа к камере:", err);
            showLoading("Ошибка доступа к камере!");
            alert(`Не удалось получить доступ к камере: ${err.name}. Проверьте разрешения и HTTPS.`);
        }
    }

    function checkReadyAndStart() {
        if (modelsLoaded && videoReady) {
            console.log("Модели загружены и видео готово. Запуск!");
            hideLoading();
            setCurrentMask('none', './masks/none.png'); // Начинаем без маски
            requestAnimationFrame(detectAndDraw);
        } else {
             console.log(`Ожидание: Модели ${modelsLoaded ? 'OK' : 'Нет'}, Видео ${videoReady ? 'OK' : 'Нет'}`);
             if (!modelsLoaded) showLoading("Загрузка моделей...");
             else if (!videoReady) showLoading("Ожидание видео...");
        }
    }

     function preloadMaskImages() {
        console.log("Предзагрузка изображений масок...");
        let imagesToLoad = 0;
        let loadedCount = 0;

        MASK_TYPES.forEach(type => {
             if (AVAILABLE_MASKS[type]) { // Добавим проверку существования ключа
                 imagesToLoad += AVAILABLE_MASKS[type].length;
             } else {
                 console.warn(`Ключ '${type}' отсутствует в AVAILABLE_MASKS.`);
             }
        });
        const nonePngPath = './masks/none.png';
        imagesToLoad++; // Считаем 'none.png'

        console.log(`Всего масок для попытки загрузки: ${imagesToLoad}`);
        if (imagesToLoad <= 1 && !maskImages[nonePngPath]) { // <= 1, т.к. none.png всегда считаем
             console.warn("Нет масок для предзагрузки (кроме, возможно, none.png).");
             // Все равно пытаемся загрузить none.png
        }

        const checkAllLoaded = () => {
            loadedCount++;
            if (loadedCount >= imagesToLoad) { // Используем >= на случай ошибок
                console.log("Предзагрузка изображений масок завершена.");
            }
        };

        MASK_TYPES.forEach(type => {
            if (!AVAILABLE_MASKS[type]) return; // Пропускаем, если ключ не найден

            const folder = type; // 'glasses' или 'crowns'
            AVAILABLE_MASKS[type].forEach(filename => {
                const fullPath = `./masks/${folder}/${filename}`;
                const img = new Image();
                maskImages[fullPath] = img; // Ключ - полный путь
                img.onload = () => {
                     if (img.naturalHeight === 0) {
                         console.error(`Ошибка: Файл '${fullPath}' загружен, но некорректен.`);
                         maskImages[fullPath] = null; // Невалидный
                     }
                     checkAllLoaded();
                };
                img.onerror = () => { console.error(`!!! ОШИБКА загрузки: ${fullPath}`); maskImages[fullPath] = null; checkAllLoaded(); };
                img.src = fullPath;
            });
        });

         // Загружаем 'none.png'
         const noneImg = new Image();
         maskImages[nonePngPath] = noneImg;
         noneImg.onload = () => { if (noneImg.naturalHeight === 0) maskImages[nonePngPath] = null; checkAllLoaded(); };
         noneImg.onerror = () => { console.error(`!!! ОШИБКА загрузки: ${nonePngPath}`); maskImages[nonePngPath] = null; checkAllLoaded(); };
         noneImg.src = nonePngPath;

         // Если изначально не было масок, вызываем checkAllLoaded для none.png
         if (imagesToLoad === 1) {
            // checkAllLoaded будет вызван обработчиками noneImg
         }
    }

     function setCurrentMask(type, fullPath) {
        // Проверяем наличие картинки в кэше и ее валидность
        if (maskImages[fullPath] && maskImages[fullPath].complete && maskImages[fullPath].naturalHeight > 0) {
            currentMaskType = type;
            currentMaskFullPath = fullPath;
            currentMaskImage = maskImages[fullPath];
            console.log(`Маска установлена: ${type} - ${fullPath.split('/').pop()}`);
        } else {
            // Если запрошенная маска невалидна или не загружена, ставим 'none'
            const nonePath = './masks/none.png';
            console.warn(`Не удалось установить маску: ${fullPath}. Установка 'none'.`);
            currentMaskType = 'none';
            currentMaskFullPath = nonePath;
            if (maskImages[nonePath] && maskImages[nonePath].complete && maskImages[nonePath].naturalHeight > 0) {
                 currentMaskImage = maskImages[nonePath];
            } else {
                 currentMaskImage = null; // Не удалось загрузить даже none.png
                 console.error("Не удалось загрузить или найти './masks/none.png'. Маска не будет отображаться.");
            }
        }
    }

    async function detectAndDraw() {
        // Проверка готовности
        if (!modelsLoaded || !videoReady || video.paused || video.ended || video.readyState < 3) {
            requestAnimationFrame(detectAndDraw); // Продолжаем запрашивать кадр, пока не будем готовы
            return;
        }

        const detectionOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 320 });
        let detection = null;
        try {
             // Используем глобальный faceapi
            detection = await faceapi.detectSingleFace(video, detectionOptions).withFaceLandmarks(true);
        } catch (detectionError) {
            console.error("Ошибка при обнаружении лица:", detectionError);
            requestAnimationFrame(detectAndDraw); // Продолжаем цикл
            return;
        }

        // Обновление и очистка холста
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height); // Рисуем видео

        // Рисование маски
        if (detection && currentMaskType !== 'none' && currentMaskImage) {
            const landmarks = detection.landmarks;
            const typeConfig = MASK_TYPE_CONFIG[currentMaskType];

            if (!typeConfig) { // Если конфига для типа нет
                console.warn(`Нет конфига для типа маски: ${currentMaskType}`);
                requestAnimationFrame(detectAndDraw);
                return;
            }

            let x, y, width, height;
            try {
                // Расчет координат (логика осталась прежней)
                const leftEyeBrow = landmarks.getLeftEyeBrow();
                const rightEyeBrow = landmarks.getRightEyeBrow();
                const browWidth = (rightEyeBrow[4].x - leftEyeBrow[0].x);
                width = browWidth * typeConfig.scale;
                // Проверка деления на ноль для высоты
                if (currentMaskImage.naturalWidth === 0) throw new Error("Natural width of mask image is zero.");
                height = width * (currentMaskImage.naturalHeight / currentMaskImage.naturalWidth);

                if (currentMaskType === 'glasses') {
                    const browCenterX = (leftEyeBrow[0].x + rightEyeBrow[4].x) / 2;
                    x = browCenterX - width / 2;
                    const leftEye = landmarks.getLeftEye();
                    const rightEye = landmarks.getRightEye();
                    const eyeCenterY = (leftEye[0].y + rightEye[3].y) / 2;
                    y = eyeCenterY - height / 2 + height * typeConfig.offsetY;
                } else if (currentMaskType === 'crown') {
                    const browCenterX = (leftEyeBrow[0].x + rightEyeBrow[4].x) / 2;
                    x = browCenterX - width / 2;
                    const browMidTopY = (leftEyeBrow[2].y + rightEyeBrow[2].y) / 2;
                    const targetCenterY = browMidTopY + (height * typeConfig.offsetY);
                    y = targetCenterY - (height / 2);
                }

                // Рисуем, если координаты валидны
                if (x !== undefined && y !== undefined && width > 0 && height > 0 && !isNaN(x) && !isNaN(y) && !isNaN(width) && !isNaN(height)) {
                    // Опциональная проверка на выход за границы
                    if (x < canvas.width && y < canvas.height && x + width > 0 && y + height > 0) {
                        ctx.drawImage(currentMaskImage, x, y, width, height);
                    }
                }
            } catch (coordError) {
                console.error(`Ошибка при расчете/рисовании координат маски '${currentMaskFullPath}':`, coordError);
                // Можно добавить сброс маски при ошибке: setCurrentMask('none', './masks/none.png');
            }
        }
        // Запрашиваем следующий кадр
        requestAnimationFrame(detectAndDraw);
    }

     function takeScreenshot() {
        try {
             if (canvas.width > 0 && canvas.height > 0) {
                 const dataUrl = canvas.toDataURL('image/png');
                 const link = document.createElement('a');
                 link.href = dataUrl;
                 link.download = `facemask_screenshot_${Date.now()}.png`;
                 document.body.appendChild(link);
                 link.click();
                 document.body.removeChild(link);
                 console.log("Скриншот сохранен.");
             } else {
                console.warn("Невозможно сделать скриншот: холст пуст или имеет нулевые размеры.");
                alert("Не удалось сделать скриншот. Камера еще не активна?");
             }
        } catch (e) {
            console.error("Ошибка при создании скриншота:", e);
            // Ошибки могут быть связаны с 'tainted canvas' если используются внешние ресурсы без CORS, но здесь это маловероятно
            alert(`Ошибка при создании скриншота: ${e.message}`);
        }
    }

    // --- Функция случайного выбора маски ---
    function changeMaskRandomly() {
        console.log("Смена маски по кнопке...");
        const validMaskPaths = [];
        MASK_TYPES.forEach(type => {
            if (!AVAILABLE_MASKS[type]) return;
            AVAILABLE_MASKS[type].forEach(filename => {
                const fullPath = `./masks/${type}/${filename}`;
                // Добавляем только если маска реально загружена и валидна
                if (maskImages[fullPath] && maskImages[fullPath].complete && maskImages[fullPath].naturalHeight > 0) {
                    validMaskPaths.push({ type: type === 'crowns' ? 'crown' : 'glasses', path: fullPath });
                } else {
                     // console.log(`Маска ${fullPath} не загружена/невалидна, пропускаем.`);
                }
            });
        });
        // Добавляем 'none' только если none.png загружен
        const nonePath = './masks/none.png';
        if (maskImages[nonePath] && maskImages[nonePath].complete && maskImages[nonePath].naturalHeight > 0) {
             validMaskPaths.push({ type: 'none', path: nonePath });
        } else {
             console.warn("none.png не загружен, опция 'без маски' может быть недоступна для выбора.");
        }


        if (validMaskPaths.length === 0) {
             console.error("Нет валидных масок для выбора!");
             alert("Нет доступных масок для смены.");
             return;
        }

        let selectablePaths = validMaskPaths;
        // Стараемся не повторять предыдущую маску, если есть другие варианты
        if (validMaskPaths.length > 1 && currentMaskFullPath) {
             selectablePaths = validMaskPaths.filter(item => item.path !== currentMaskFullPath);
             if(selectablePaths.length === 0) selectablePaths = validMaskPaths; // Если осталась только текущая, выбираем из всех
        }

        const randomIndex = Math.floor(Math.random() * selectablePaths.length);
        const chosenMask = selectablePaths[randomIndex];
        setCurrentMask(chosenMask.type, chosenMask.path);
    }


    // --- Добавление обработчиков событий ---
    if (changeMaskButton) {
        changeMaskButton.addEventListener('click', changeMaskRandomly);
    } else {
        console.error("Не удалось найти кнопку 'СМЕНИТЬ'.");
    }

    if (screenshotButton) {
        screenshotButton.addEventListener('click', takeScreenshot);
    } else {
         console.error("Не удалось найти кнопку 'СКРИНШОТ'.");
    }

    // --- Инициализация приложения ---
    console.log("Запуск инициализации приложения...");
    preloadMaskImages();
    loadModels();
    startVideo();

}); // Конец DOMContentLoaded
