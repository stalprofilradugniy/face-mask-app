document.addEventListener('DOMContentLoaded', (event) => {

    // --- Получение ссылок на HTML элементы ---
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const loadingIndicator = document.getElementById('loading');
    const screenshotButton = document.getElementById('screenshot-button');
    const changeMaskButton = document.getElementById('change-mask-button');

    if (!video || !canvas || !loadingIndicator || !screenshotButton || !changeMaskButton) {
        console.error("Ошибка: Не найден один или несколько HTML элементов."); alert("Ошибка инициализации приложения."); return;
    }
    const ctx = canvas.getContext('2d');

    // --- Переменные состояния ---
    let currentMaskType = 'none';
    let currentMaskFullPath = null;
    let currentMaskImage = null;
    // ИСПРАВЛЕНО: Используем let вместо const, чтобы можно было очищать кэш
    let maskImages = {};
    let loadedMasks = [];
    let modelsLoaded = false;
    let videoReady = false;

    // --- Конфигурация ТИПОВ масок ---
    const MASK_TYPE_CONFIG = {
        glasses: { scale: 1.25, offsetY: 0 },
        crown:   { scale: 1.4,  offsetY: -0.45 },
    };
    const DEFAULT_MASK_CONFIG = { scale: 1.2, offsetY: 0 };

    // --- Функции showLoading, hideLoading, loadModels, startVideo, checkReadyAndStart, takeScreenshot ---
    // (Код этих функций не менялся, вставляем его)
    function showLoading(message) { if (loadingIndicator) { loadingIndicator.innerText = message; loadingIndicator.classList.add('visible'); } console.log(`Статус загрузки: ${message}`); }
    function hideLoading() { if (loadingIndicator) { loadingIndicator.classList.remove('visible'); } }
    async function loadModels() { const MODEL_URL = './models'; showLoading("Загрузка моделей..."); console.log(`Загрузка моделей из: ${MODEL_URL}`); try { await Promise.all([ faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL), faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL) ]); console.log("Модели face-api.js успешно загружены!"); modelsLoaded = true; checkReadyAndStart(); } catch (error) { console.error("!!! ОШИБКА загрузки моделей:", error); showLoading("Ошибка загрузки моделей!"); alert(`Произошла ошибка при загрузке моделей: ${error.message}.`); } }
    async function startVideo() { showLoading("Запрос доступа к камере..."); try { const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } }); video.srcObject = stream; console.log("Доступ к камере получен."); video.onloadedmetadata = () => { console.log("Метаданные видео загружены."); canvas.width = video.videoWidth; canvas.height = video.videoHeight; console.log(`Размер Canvas: ${canvas.width}x${canvas.height}`); videoReady = true; checkReadyAndStart(); }; video.addEventListener('play', () => { console.log("Событие 'play' для видео."); if (!videoReady && video.videoWidth > 0) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; videoReady = true; console.log(`Размер Canvas установлен при 'play': ${canvas.width}x${canvas.height}`); checkReadyAndStart(); } else if (videoReady) { checkReadyAndStart(); } }); } catch (err) { console.error("!!! ОШИБКА доступа к камере:", err); showLoading("Ошибка доступа к камере!"); alert(`Не удалось получить доступ к камере: ${err.name}.`); } }
    function checkReadyAndStart() { if (modelsLoaded && videoReady) { console.log("Модели загружены и видео готово. Запуск!"); hideLoading(); setCurrentMask('none', './masks/none.png'); requestAnimationFrame(detectAndDraw); } else { console.log(`Ожидание: Модели ${modelsLoaded ? 'OK' : 'Нет'}, Видео ${videoReady ? 'OK' : 'Нет'}`); if (!modelsLoaded) showLoading("Загрузка моделей..."); else if (!videoReady) showLoading("Ожидание видео..."); } }
    function takeScreenshot() { try { if (canvas.width > 0 && canvas.height > 0) { const dataUrl = canvas.toDataURL('image/png'); const link = document.createElement('a'); link.href = dataUrl; link.download = `facemask_screenshot_${Date.now()}.png`; document.body.appendChild(link); link.click(); document.body.removeChild(link); console.log("Скриншот сохранен."); } else { console.warn("Невозможно сделать скриншот."); alert("Не удалось сделать скриншот."); } } catch (e) { console.error("Ошибка при создании скриншота:", e); alert(`Ошибка при создании скриншота: ${e.message}`); } }
    // --- Конец неизменных функций ---

    // Вспомогательная функция для загрузки изображения
    function loadImage(path) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => { if (image.naturalHeight === 0) { reject(new Error('Invalid image height')); } else { resolve(image); } };
            image.onerror = () => reject(new Error('Load error')); image.src = path;
        });
    }

    // --- Предзагрузка масок с префиксами ---
    async function preloadMaskImages() {
        console.log("Загрузка масок с префиксами (glasses_*, crown_*)");
        // Очищаем ПЕРЕД началом загрузки
        loadedMasks = [];
        maskImages = {}; // Теперь это работает, так как maskImages объявлен через let
        let errorCount = 0;
        const prefixes = ['glasses', 'crown'];
        const MAX_MASKS_PER_PREFIX = 50;
        const loadingPromises = [];

        // Загружаем none.png
        const nonePngPath = './masks/none.png';
        loadingPromises.push(new Promise(async (resolve) => {
            console.log(`  Пробуем загрузить: ${nonePngPath}`);
            try {
                const noneImg = await loadImage(nonePngPath); maskImages[nonePngPath] = noneImg; console.log(`  [+] Успех: ${nonePngPath}`);
            } catch(e) { console.error(`  [-] Ошибка загрузки ${nonePngPath}.`); maskImages[nonePngPath] = null; errorCount++; } resolve();
        }));

        // Ищем маски с префиксами
        for (const prefix of prefixes) {
            for (let i = 1; i <= MAX_MASKS_PER_PREFIX; i++) {
                const filename = `${prefix}_${i}.png`; const path = `./masks/${filename}`;
                const loadPromise = new Promise(async (resolve) => {
                    try {
                        const img = await loadImage(path);
                        console.log(`    [+] Успех: ${path}`); maskImages[path] = img;
                        loadedMasks.push({ path: path, type: prefix });
                        resolve(true);
                    } catch (error) {
                        if (!(error instanceof Error && error.message === 'Load error')) { console.error(`    [-] Ошибка загрузки/валидации ${path}:`, error); errorCount++; }
                        resolve(false);
                    }
                });
                loadingPromises.push(loadPromise);
                const success = await loadPromise;
                if (!success) { console.log(`  Останавливаем поиск для '${prefix}' после ${path}`); break; }
            }
        }

        await Promise.all(loadingPromises);
        console.log(`Предзагрузка завершена. Успешно загружено масок: ${loadedMasks.length}. Ошибок (кроме 404): ${errorCount}.`);
        console.log("Итоговый список загруженных масок:", loadedMasks);
    }

    // --- Установка текущей маски ---
    function setCurrentMask(type, fullPath) { /* ... код без изменений ... */ }
    // --- Копируем неизменную функцию setCurrentMask ---
    function setCurrentMask(type, fullPath) {
        if (maskImages[fullPath] && maskImages[fullPath].complete && maskImages[fullPath].naturalHeight > 0) {
            currentMaskType = type; currentMaskFullPath = fullPath; currentMaskImage = maskImages[fullPath];
            console.log(`Маска установлена: Тип=${type}, Файл=${fullPath.split('/').pop()}`);
        } else {
            const nonePath = './masks/none.png'; console.warn(`Не удалось установить маску: ${fullPath}. Установка 'none'.`);
            currentMaskType = 'none'; currentMaskFullPath = nonePath;
            if (maskImages[nonePath] && maskImages[nonePath].complete && maskImages[nonePath].naturalHeight > 0) {
                 currentMaskImage = maskImages[nonePath]; console.log("Установлена маска 'none'.");
            } else { currentMaskImage = null; console.error("Не удалось загрузить './masks/none.png'."); }
        }
    }
    // --- Конец неизменной функции setCurrentMask ---


    // --- Функция случайного выбора маски ---
    function changeMaskRandomly() { /* ... код без изменений ... */ }
    // --- Копируем неизменную функцию changeMaskRandomly ---
    function changeMaskRandomly() {
        console.log("--- Попытка смены маски по кнопке ---");
        const availableOptions = [...loadedMasks];
        const nonePath = './masks/none.png';
        if (maskImages[nonePath] && maskImages[nonePath].complete && maskImages[nonePath].naturalHeight > 0) {
            availableOptions.push({ path: nonePath, type: 'none' });
        }
        console.log(`Всего доступных опций для выбора: ${availableOptions.length}`); console.log('Опции:', availableOptions);
        if (availableOptions.length === 0) { console.error("Нет доступных масок!"); alert("Нет доступных масок."); return; }
        let selectableOptions = availableOptions;
        if (availableOptions.length > 1 && currentMaskFullPath) {
            selectableOptions = availableOptions.filter(item => item.path !== currentMaskFullPath);
            if (selectableOptions.length === 0) selectableOptions = availableOptions;
        }
        const randomIndex = Math.floor(Math.random() * selectableOptions.length);
        const chosenMask = selectableOptions[randomIndex];
        console.log(`Выбрана случайная опция: Тип=${chosenMask.type}, Путь=${chosenMask.path}`);
        setCurrentMask(chosenMask.type, chosenMask.path);
        console.log("--- Смена маски завершена ---");
    }
    // --- Конец неизменной функции changeMaskRandomly ---


    // --- Основной цикл отрисовки ---
    async function detectAndDraw() { /* ... код без изменений ... */ }
    // --- Копируем неизменную функцию detectAndDraw ---
    async function detectAndDraw() {
        if (!modelsLoaded || !videoReady || video.paused || video.ended || video.readyState < 3) { requestAnimationFrame(detectAndDraw); return; }
        const detectionOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 320 });
        let detection = null;
        try { detection = await faceapi.detectSingleFace(video, detectionOptions).withFaceLandmarks(true); }
        catch (detectionError) { console.error("Ошибка при обнаружении лица:", detectionError); requestAnimationFrame(detectAndDraw); return; }
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
        ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        if (detection && currentMaskType !== 'none' && currentMaskImage) {
            const landmarks = detection.landmarks;
            const typeConfig = MASK_TYPE_CONFIG[currentMaskType] || DEFAULT_MASK_CONFIG;
            let x, y, width, height;
            try {
                const leftEyeBrow = landmarks.getLeftEyeBrow(); const rightEyeBrow = landmarks.getRightEyeBrow();
                const browWidth = (rightEyeBrow[4].x - leftEyeBrow[0].x); width = browWidth * typeConfig.scale;
                if (currentMaskImage.naturalWidth === 0) throw new Error("Mask image width is zero.");
                height = width * (currentMaskImage.naturalHeight / currentMaskImage.naturalWidth);
                if (currentMaskType === 'glasses') {
                    const browCenterX = (leftEyeBrow[0].x + rightEyeBrow[4].x) / 2; x = browCenterX - width / 2;
                    const leftEye = landmarks.getLeftEye(); const rightEye = landmarks.getRightEye();
                    const eyeCenterY = (leftEye[0].y + rightEye[3].y) / 2; y = eyeCenterY - height / 2 + height * typeConfig.offsetY;
                } else if (currentMaskType === 'crown') {
                    const browCenterX = (leftEyeBrow[0].x + rightEyeBrow[4].x) / 2; x = browCenterX - width / 2;
                    const browMidTopY = (leftEyeBrow[2].y + rightEyeBrow[2].y) / 2;
                    const targetCenterY = browMidTopY + (height * typeConfig.offsetY); y = targetCenterY - (height / 2);
                } else { // Логика по умолчанию
                    console.warn(`Неизвестный тип '${currentMaskType}', используем позиционирование по умолчанию.`);
                    const defaultConf = DEFAULT_MASK_CONFIG; width = browWidth * defaultConf.scale;
                    height = width * (currentMaskImage.naturalHeight / currentMaskImage.naturalWidth);
                    const browCenterX = (leftEyeBrow[0].x + rightEyeBrow[4].x) / 2; x = browCenterX - width / 2;
                    const leftEye = landmarks.getLeftEye(); const rightEye = landmarks.getRightEye();
                    const eyeCenterY = (leftEye[0].y + rightEye[3].y) / 2; y = eyeCenterY - height / 2 + height * defaultConf.offsetY;
                }
                if (x !== undefined && y !== undefined && width > 0 && height > 0 && !isNaN(x) && !isNaN(y) && !isNaN(width) && !isNaN(height)) {
                    if (x < canvas.width && y < canvas.height && x + width > 0 && y + height > 0) {
                        ctx.drawImage(currentMaskImage, x, y, width, height);
                    }
                }
            } catch (coordError) { console.error(`Ошибка при расчете/рисовании координат '${currentMaskFullPath}':`, coordError); }
        }
        requestAnimationFrame(detectAndDraw);
    }
    // --- Конец неизменной функции detectAndDraw ---


    // --- Добавление обработчиков событий ---
    if (changeMaskButton) changeMaskButton.addEventListener('click', changeMaskRandomly);
    else console.error("Не удалось найти кнопку 'СМЕНИТЬ'.");
    if (screenshotButton) screenshotButton.addEventListener('click', takeScreenshot);
    else console.error("Не удалось найти кнопку 'СКРИНШОТ'.");

    // --- Инициализация приложения ---
    console.log("Запуск инициализации приложения...");
    preloadMaskImages();
    loadModels();
    startVideo();

}); // Конец DOMContentLoaded
