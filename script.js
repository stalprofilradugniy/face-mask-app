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
    const AVAILABLE_MASKS = {
        glasses: [ 'glasses1.png', 'glasses2.png', 'glasses3.png' ],
        crowns: [ 'crown1.png', 'crown2.png', 'crown3.png' ]
    };
    const MASK_TYPES = Object.keys(AVAILABLE_MASKS);

    // --- Функции загрузки, старта видео, проверки готовности (БЕЗ ИЗМЕНЕНИЙ) ---
    function showLoading(message) { /* ... */ }
    function hideLoading() { /* ... */ }
    async function loadModels() { /* ... */ }
    async function startVideo() { /* ... */ }
    function checkReadyAndStart() { /* ... */ }
    function preloadMaskImages() { /* ... */ }
    function setCurrentMask(type, fullPath) { /* ... */ }
    async function detectAndDraw() { /* ... */ }
    function takeScreenshot() { /* ... */ }

    // --- Код функций без изменений (для краткости опущен, см. предыдущий ответ, если нужно) ---
    // --- Вставьте сюда полный код функций: ---
    // showLoading, hideLoading, loadModels, startVideo, checkReadyAndStart,
    // preloadMaskImages, setCurrentMask, detectAndDraw, takeScreenshot
    // --- ВАЖНО: Содержимое этих функций НЕ МЕНЯЕТСЯ ---

    // --- Начало копирования неизменных функций ---
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
        const MODEL_URL = './models';
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
            showLoading("Ошибка загрузки моделей!");
            alert(`Произошла ошибка при загрузке моделей: ${error.message}.`);
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
            alert(`Не удалось получить доступ к камере: ${err.name}.`);
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

        MASK_TYPES.forEach(type => { imagesToLoad += AVAILABLE_MASKS[type].length; });
        const nonePngPath = './masks/none.png';
        imagesToLoad++;

        console.log(`Всего масок для попытки загрузки: ${imagesToLoad}`);
        if (imagesToLoad === 0) {
             console.warn("Нет масок для предзагрузки.");
             return;
        }

        const checkAllLoaded = () => {
            loadedCount++;
            if (loadedCount === imagesToLoad) {
                console.log("Предзагрузка изображений масок завершена.");
            }
        };

        MASK_TYPES.forEach(type => {
            const folder = type;
            AVAILABLE_MASKS[type].forEach(filename => {
                const fullPath = `./masks/${folder}/${filename}`;
                const img = new Image();
                maskImages[fullPath] = img;
                img.onload = () => { if (img.naturalHeight === 0) maskImages[fullPath] = null; checkAllLoaded(); };
                img.onerror = () => { console.error(`!!! ОШИБКА загрузки: ${fullPath}`); maskImages[fullPath] = null; checkAllLoaded(); };
                img.src = fullPath;
            });
        });

         const noneImg = new Image();
         maskImages[nonePngPath] = noneImg;
         noneImg.onload = () => { if (noneImg.naturalHeight === 0) maskImages[nonePngPath] = null; checkAllLoaded(); };
         noneImg.onerror = () => { console.error(`!!! ОШИБКА загрузки: ${nonePngPath}`); maskImages[nonePngPath] = null; checkAllLoaded(); };
         noneImg.src = nonePngPath;
    }

     function setCurrentMask(type, fullPath) {
        if (maskImages[fullPath] && maskImages[fullPath].complete && maskImages[fullPath].naturalHeight > 0) {
            currentMaskType = type;
            currentMaskFullPath = fullPath;
            currentMaskImage = maskImages[fullPath];
            console.log(`Маска установлена: ${type} - ${fullPath.split('/').pop()}`);
        } else {
            console.warn(`Не удалось установить маску: ${fullPath}. Установка 'none'.`);
            currentMaskType = 'none';
            currentMaskFullPath = './masks/none.png';
            if (maskImages[currentMaskFullPath] && maskImages[currentMaskFullPath].complete && maskImages[currentMaskFullPath].naturalHeight > 0) {
                 currentMaskImage = maskImages[currentMaskFullPath];
            } else {
                 currentMaskImage = null;
            }
        }
    }

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

        if (detection && currentMaskType !== 'none' && currentMaskImage) {
            const landmarks = detection.landmarks;
            const typeConfig = MASK_TYPE_CONFIG[currentMaskType];

            if (!typeConfig) {
                requestAnimationFrame(detectAndDraw);
                return;
            }

            let x, y, width, height;
            try {
                const leftEyeBrow = landmarks.getLeftEyeBrow();
                const rightEyeBrow = landmarks.getRightEyeBrow();
                const browWidth = (rightEyeBrow[4].x - leftEyeBrow[0].x);
                width = browWidth * typeConfig.scale;
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
                console.warn("Невозможно сделать скриншот: холст пуст.");
                alert("Не удалось сделать скриншот.");
             }
        } catch (e) {
            console.error("Ошибка при создании скриншота:", e);
            alert(`Ошибка при создании скриншота: ${e.message}`);
        }
    }
    // --- Конец копирования неизменных функций ---


    // --- Функция случайного выбора маски (вызывается по кнопке) (БЕЗ ИЗМЕНЕНИЙ) ---
    function changeMaskRandomly() {
        console.log("Смена маски по кнопке...");
        const validMaskPaths = [];
        MASK_TYPES.forEach(type => {
            AVAILABLE_MASKS[type].forEach(filename => {
                const fullPath = `./masks/${type}/${filename}`;
                if (maskImages[fullPath] && maskImages[fullPath].complete && maskImages[fullPath].naturalHeight > 0) {
                    validMaskPaths.push({ type: type === 'crowns' ? 'crown' : 'glasses', path: fullPath });
                }
            });
        });
        validMaskPaths.push({ type: 'none', path: './masks/none.png' });

        if (validMaskPaths.length === 0) {
             console.error("Нет валидных масок для выбора!");
             return;
        }

        let selectablePaths = validMaskPaths;
        if (validMaskPaths.length > 1 && currentMaskFullPath) {
             selectablePaths = validMaskPaths.filter(item => item.path !== currentMaskFullPath);
             if(selectablePaths.length === 0) selectablePaths = validMaskPaths;
        }

        const randomIndex = Math.floor(Math.random() * selectablePaths.length);
        const chosenMask = selectablePaths[randomIndex];
        setCurrentMask(chosenMask.type, chosenMask.path);
    }


    // --- Добавление обработчиков событий ---

    // 1. УБРАН ОБРАБОТЧИК КЛИКА С CANVAS
    // if (canvas) {
    //     canvas.removeEventListener('click', changeMaskRandomly); // Явно удаляем, если был добавлен ранее
    // }

    // 2. ОБРАБОТЧИК НА КНОПКУ "СМЕНИТЬ"
    if (changeMaskButton) {
        changeMaskButton.addEventListener('click', changeMaskRandomly); // Вызываем ту же функцию
    } else {
        console.error("Не удалось найти кнопку 'СМЕНИТЬ' для добавления обработчика.");
    }

    // 3. ОБРАБОТЧИК НА КНОПКУ "СКРИНШОТ" (без изменений)
    if (screenshotButton) {
        screenshotButton.addEventListener('click', takeScreenshot);
    }

    // --- Инициализация приложения (без изменений) ---
    console.log("Запуск инициализации приложения...");
    preloadMaskImages();
    loadModels();
    startVideo();

}); // Конец DOMContentLoaded
