// Убедимся, что скрипт выполняется только после загрузки DOM
document.addEventListener('DOMContentLoaded', (event) => {

    // --- Получение ссылок на HTML элементы ---
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const loadingIndicator = document.getElementById('loading');
    const screenshotButton = document.getElementById('screenshot-button');
    const changeMaskButton = document.getElementById('change-mask-button');

    if (!video || !canvas || !loadingIndicator || !screenshotButton || !changeMaskButton) {
        console.error("Ошибка: Не найден один или несколько HTML элементов.");
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
        crown: { scale: 1.4, offsetY: -0.45 } // Ключ 'crown' совпадает с папкой
    };

    // --- Списки файлов масок ---
    const AVAILABLE_MASKS = {
        glasses: [ 'glasses1.png', 'glasses2.png', 'glasses3.png' ],
        // ИСПРАВЛЕНО: ключ 'crown' соответствует имени папки masks/crown/
        crown: [ 'crown1.png', 'crown2.png', 'crown3.png' ]
    };
    const MASK_TYPES = Object.keys(AVAILABLE_MASKS); // Теперь ['glasses', 'crown']

    // --- Функции загрузки, старта видео, проверки готовности ---
    function showLoading(message) { /* ... код без изменений ... */ }
    function hideLoading() { /* ... код без изменений ... */ }
    async function loadModels() { /* ... код без изменений ... */ }
    async function startVideo() { /* ... код без изменений ... */ }
    function checkReadyAndStart() { /* ... код без изменений ... */ }
    function setCurrentMask(type, fullPath) { /* ... код без изменений ... */ }
    async function detectAndDraw() { /* ... код без изменений ... */ }
    function takeScreenshot() { /* ... код без изменений ... */ }

    // --- Копируем неизмененный код функций ---
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
            setCurrentMask('none', './masks/none.png');
            requestAnimationFrame(detectAndDraw);
        } else {
             console.log(`Ожидание: Модели ${modelsLoaded ? 'OK' : 'Нет'}, Видео ${videoReady ? 'OK' : 'Нет'}`);
             if (!modelsLoaded) showLoading("Загрузка моделей...");
             else if (!videoReady) showLoading("Ожидание видео...");
        }
    }

    // --- Предзагрузка изображений масок (добавлено логирование) ---
    function preloadMaskImages() {
        console.log("Предзагрузка изображений масок...");
        let imagesToLoad = 0;
        let loadedCount = 0;
        let errorCount = 0; // Счетчик ошибок

        MASK_TYPES.forEach(type => {
             if (AVAILABLE_MASKS[type]) {
                 imagesToLoad += AVAILABLE_MASKS[type].length;
             } else {
                 console.warn(`Ключ '${type}' отсутствует в AVAILABLE_MASKS.`);
             }
        });
        const nonePngPath = './masks/none.png';
        imagesToLoad++; // Считаем 'none.png'

        console.log(`Всего масок для попытки загрузки: ${imagesToLoad}`);
        if (imagesToLoad <= 1 && !AVAILABLE_MASKS.glasses && !AVAILABLE_MASKS.crown) {
             console.warn("Нет масок для предзагрузки (кроме, возможно, none.png).");
        }

        const checkAllLoaded = () => {
            loadedCount++;
            if (loadedCount >= imagesToLoad) {
                 console.log(`Предзагрузка завершена. Успешно: ${loadedCount - errorCount}, Ошибок: ${errorCount}`);
            }
        };

        MASK_TYPES.forEach(type => { // type будет 'glasses' или 'crown'
            if (!AVAILABLE_MASKS[type]) return;

            const folder = type; // Имя папки = ключ типа
            AVAILABLE_MASKS[type].forEach(filename => {
                const fullPath = `./masks/${folder}/${filename}`; // Правильный путь
                const img = new Image();
                maskImages[fullPath] = img; // Ключ - полный путь

                img.onload = () => {
                     if (img.naturalHeight === 0) {
                         console.error(`- ОШИБКА: Файл '${fullPath}' загружен, но некорректен (0 высота).`);
                         maskImages[fullPath] = null;
                         errorCount++;
                     } else {
                        // console.log(`+ OK: Маска загружена: ${fullPath}`); // Можно раскомментировать для детального лога
                     }
                     checkAllLoaded();
                };
                img.onerror = () => {
                    console.error(`- ОШИБКА ЗАГРУЗКИ: ${fullPath}`);
                    maskImages[fullPath] = null;
                    errorCount++;
                    checkAllLoaded();
                };
                // console.log(`  Запрос: ${fullPath}`); // Лог запроса
                img.src = fullPath;
            });
        });

         // Загружаем 'none.png'
         const noneImg = new Image();
         maskImages[nonePngPath] = noneImg;
         noneImg.onload = () => {
            if (noneImg.naturalHeight === 0){
                 console.error(`- ОШИБКА: Файл '${nonePngPath}' загружен, но некорректен.`);
                 maskImages[nonePngPath] = null;
                 errorCount++;
            } else {
                 // console.log(`+ OK: Маска загружена: ${nonePngPath}`);
            }
            checkAllLoaded();
         };
         noneImg.onerror = () => {
            console.error(`- ОШИБКА ЗАГРУЗКИ: ${nonePngPath}`);
            maskImages[nonePngPath] = null;
            errorCount++;
            checkAllLoaded();
         };
         // console.log(`  Запрос: ${nonePngPath}`);
         noneImg.src = nonePngPath;
    }

     function setCurrentMask(type, fullPath) {
        if (maskImages[fullPath] && maskImages[fullPath].complete && maskImages[fullPath].naturalHeight > 0) {
            currentMaskType = type;
            currentMaskFullPath = fullPath;
            currentMaskImage = maskImages[fullPath];
            console.log(`Маска установлена: ${type} - ${fullPath.split('/').pop()}`);
        } else {
            const nonePath = './masks/none.png';
            console.warn(`Не удалось установить маску: ${fullPath}. Попытка установить 'none'.`);
            currentMaskType = 'none';
            currentMaskFullPath = nonePath;
            if (maskImages[nonePath] && maskImages[nonePath].complete && maskImages[nonePath].naturalHeight > 0) {
                 currentMaskImage = maskImages[nonePath];
                 console.log("Установлена маска 'none'.");
            } else {
                 currentMaskImage = null;
                 console.error("Не удалось загрузить или найти './masks/none.png'. Маска не будет отображаться.");
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
             // Тип 'glasses' или 'crown' теперь совпадает с ключом в MASK_TYPE_CONFIG
            const typeConfig = MASK_TYPE_CONFIG[currentMaskType];

            if (!typeConfig) {
                console.warn(`Нет конфига для типа маски: ${currentMaskType}`);
                requestAnimationFrame(detectAndDraw);
                return;
            }

            let x, y, width, height;
            try {
                const leftEyeBrow = landmarks.getLeftEyeBrow();
                const rightEyeBrow = landmarks.getRightEyeBrow();
                const browWidth = (rightEyeBrow[4].x - leftEyeBrow[0].x);
                width = browWidth * typeConfig.scale;
                if (currentMaskImage.naturalWidth === 0) throw new Error("Natural width of mask image is zero.");
                height = width * (currentMaskImage.naturalHeight / currentMaskImage.naturalWidth);

                if (currentMaskType === 'glasses') {
                    const browCenterX = (leftEyeBrow[0].x + rightEyeBrow[4].x) / 2;
                    x = browCenterX - width / 2;
                    const leftEye = landmarks.getLeftEye();
                    const rightEye = landmarks.getRightEye();
                    const eyeCenterY = (leftEye[0].y + rightEye[3].y) / 2;
                    y = eyeCenterY - height / 2 + height * typeConfig.offsetY;
                } else if (currentMaskType === 'crown') { // Ключ 'crown'
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
                console.error(`Ошибка при расчете/рисовании координат маски '${currentMaskFullPath}':`, coordError);
            }
        }
        requestAnimationFrame(detectAndDraw);
    }

     function takeScreenshot() { /* ... код без изменений ... */ }
     // --- Копируем неизменную функцию takeScreenshot ---
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
    // --- Конец копирования неизменной функции takeScreenshot ---


    // --- Функция случайного выбора маски (Исправлена логика получения типа) ---
    function changeMaskRandomly() {
        console.log("Смена маски по кнопке...");
        const validMaskPaths = [];
        // Используем исправленные MASK_TYPES ('glasses', 'crown')
        MASK_TYPES.forEach(typeKey => { // typeKey будет 'glasses' или 'crown'
            if (!AVAILABLE_MASKS[typeKey]) return;
            AVAILABLE_MASKS[typeKey].forEach(filename => {
                const fullPath = `./masks/${typeKey}/${filename}`; // Путь строится на основе ключа
                if (maskImages[fullPath] && maskImages[fullPath].complete && maskImages[fullPath].naturalHeight > 0) {
                    // Тип для setCurrentMask должен быть 'glasses' или 'crown' (совпадает с typeKey)
                    validMaskPaths.push({ type: typeKey, path: fullPath });
                }
            });
        });

        const nonePath = './masks/none.png';
        if (maskImages[nonePath] && maskImages[nonePath].complete && maskImages[nonePath].naturalHeight > 0) {
             validMaskPaths.push({ type: 'none', path: nonePath });
        } else {
             console.warn("none.png не загружен, опция 'без маски' может быть недоступна.");
        }

        console.log(`Доступно для выбора масок (включая none): ${validMaskPaths.length}`);
        if (validMaskPaths.length === 0) {
             console.error("Нет валидных масок для выбора!");
             alert("Нет доступных масок для смены.");
             return;
        }

        let selectablePaths = validMaskPaths;
        if (validMaskPaths.length > 1 && currentMaskFullPath) {
             selectablePaths = validMaskPaths.filter(item => item.path !== currentMaskFullPath);
             if(selectablePaths.length === 0) {
                console.log("Осталась только текущая маска, выбираем из всех.");
                selectablePaths = validMaskPaths;
             }
        }

        const randomIndex = Math.floor(Math.random() * selectablePaths.length);
        const chosenMask = selectablePaths[randomIndex];
        console.log(`Выбрана маска: тип ${chosenMask.type}, путь ${chosenMask.path}`);
        setCurrentMask(chosenMask.type, chosenMask.path); // Передаем тип ('glasses', 'crown', 'none')
    }


    // --- Добавление обработчиков событий (без изменений) ---
    if (changeMaskButton) {
        changeMaskButton.addEventListener('click', changeMaskRandomly);
    } else { console.error("Не удалось найти кнопку 'СМЕНИТЬ'."); }

    if (screenshotButton) {
        screenshotButton.addEventListener('click', takeScreenshot);
    } else { console.error("Не удалось найти кнопку 'СКРИНШОТ'."); }

    // --- Инициализация приложения ---
    console.log("Запуск инициализации приложения...");
    preloadMaskImages();
    loadModels();
    startVideo();

}); // Конец DOMContentLoaded
