document.addEventListener('DOMContentLoaded', (event) => {

    // --- Получение ссылок на HTML элементы ---
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const loadingIndicator = document.getElementById('loading');
    const screenshotButton = document.getElementById('screenshot-button');
    const changeMaskButton = document.getElementById('change-mask-button');

    if (!video || !canvas || !loadingIndicator || !screenshotButton || !changeMaskButton) {
        console.error("Ошибка: Не найден один или несколько HTML элементов.");
        alert("Ошибка инициализации приложения.");
        return;
    }

    const ctx = canvas.getContext('2d');

    // --- Переменные состояния ---
    let currentMaskType = 'none'; // Тип текущей маски ('generic' или 'none')
    let currentMaskFullPath = null; // Путь к текущей маске
    let currentMaskImage = null; // Объект Image текущей маски
    const maskImages = {}; // Кэш загруженных изображений (ключ - путь)
    let loadedMaskPaths = []; // Массив путей к УСПЕШНО загруженным маскам maskN.png
    let modelsLoaded = false;
    let videoReady = false;

    // --- Конфигурация ТИПОВ масок ---
    // Теперь только 'generic' для всех maskN.png и 'none'
    const MASK_TYPE_CONFIG = {
        // Настроим позиционирование 'generic' как у корон (выше бровей)
        generic: { scale: 1.4, offsetY: -0.45 },
        // 'none' не требует конфига позиционирования
    };

    // --- Удалены AVAILABLE_MASKS и MASK_TYPES ---

    // --- Функции showLoading, hideLoading, loadModels, startVideo, checkReadyAndStart (БЕЗ ИЗМЕНЕНИЙ) ---
    function showLoading(message) { /* ... код ... */ }
    function hideLoading() { /* ... код ... */ }
    async function loadModels() { /* ... код ... */ }
    async function startVideo() { /* ... код ... */ }
    function checkReadyAndStart() { /* ... код ... */ }
    function takeScreenshot() { /* ... код ... */ }

    // --- Вставляем неизмененный код этих функций ---
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
        // Запускаем отрисовку только когда модели и видео готовы
        // Загрузка масок теперь идет асинхронно и не блокирует старт
        if (modelsLoaded && videoReady) {
            console.log("Модели загружены и видео готово. Запуск отрисовки!");
            hideLoading();
            setCurrentMask('none', './masks/none.png'); // Начинаем без маски
            requestAnimationFrame(detectAndDraw);
        } else {
             console.log(`Ожидание: Модели ${modelsLoaded ? 'OK' : 'Нет'}, Видео ${videoReady ? 'OK' : 'Нет'}`);
             if (!modelsLoaded) showLoading("Загрузка моделей...");
             else if (!videoReady) showLoading("Ожидание видео...");
        }
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
    // --- Конец неизменных функций ---

    // --- НОВАЯ Асинхронная предзагрузка масок с "прощупыванием" ---
    async function preloadMaskImages() {
        console.log("Начинаем динамическую предзагрузку масок (maskN.png)...");
        loadedMaskPaths = []; // Очищаем список перед загрузкой
        let i = 1;
        let errorCount = 0;
        const MAX_PROBE_ATTEMPTS = 100; // Ограничение на всякий случай

        while (i <= MAX_PROBE_ATTEMPTS) {
            const path = `./masks/mask${i}.png`;
            console.log(`  Пробуем загрузить: ${path}`);

            try {
                // Создаем Promise для загрузки изображения
                const img = await new Promise((resolve, reject) => {
                    const image = new Image();
                    image.onload = () => {
                        if (image.naturalHeight === 0) {
                             console.error(`- ДИНАМИЧЕСКАЯ ЗАГРУЗКА: Файл '${path}' некорректен (0 высота).`);
                             reject(new Error('Invalid image height')); // Отклоняем Promise
                        } else {
                            resolve(image); // Возвращаем загруженное изображение
                        }
                    };
                    image.onerror = (err) => {
                        // Ошибка 404 (Not Found) - это ожидаемый конец списка
                        // Другие ошибки - реальные проблемы
                        reject(err); // Отклоняем Promise
                    };
                    image.src = path;
                });

                // Если Promise успешно разрешился (onload сработал и высота > 0)
                console.log(`  [+] Успех: ${path} загружен (размер: ${img.naturalWidth}x${img.naturalHeight})`);
                maskImages[path] = img; // Добавляем в кэш
                loadedMaskPaths.push(path); // Добавляем в список валидных путей
                i++; // Переходим к следующему номеру

            } catch (errorEventOrError) {
                 // Если Promise был отклонен (onerror или высота 0)
                 // Проверяем, была ли это ошибка загрузки ресурса (вероятно 404)
                 const isLoadError = errorEventOrError && (errorEventOrError.type === 'error' || errorEventOrError instanceof Error); // Проверяем тип ошибки

                 if (isLoadError) {
                      console.log(`  [-] Не найдена или ошибка загрузки: ${path}. Останавливаем поиск.`);
                 } else {
                     console.error(`  [-] Неизвестная ошибка при загрузке ${path}:`, errorEventOrError);
                 }
                 errorCount++; // Считаем как ошибку или конец списка
                 break; // Прерываем цикл while при первой ошибке/отсутствии файла
            }
        } // конец while

        console.log(`Динамический поиск завершен. Найдено и загружено масок (maskN.png): ${loadedMaskPaths.length}`);
        if (i >= MAX_PROBE_ATTEMPTS) {
             console.warn(`Достигнут лимит попыток (${MAX_PROBE_ATTEMPTS}). Возможно, есть еще маски?`);
        }

        // Отдельно пытаемся загрузить 'none.png'
        const nonePngPath = './masks/none.png';
        console.log(`  Пробуем загрузить: ${nonePngPath}`);
        try {
             const noneImg = await new Promise((resolve, reject) => {
                  const image = new Image();
                  image.onload = () => { if (image.naturalHeight === 0) reject(new Error('Invalid image height')); else resolve(image); };
                  image.onerror = reject;
                  image.src = nonePngPath;
             });
             maskImages[nonePngPath] = noneImg;
             console.log(`  [+] Успех: ${nonePngPath} загружен.`);
        } catch(e){
             console.error(`  [-] Ошибка загрузки ${nonePngPath}.`);
             maskImages[nonePngPath] = null;
             errorCount++;
        }

        console.log(`Общая предзагрузка завершена. Всего ошибок/ненайденных: ${errorCount}`);
        console.log("Итоговый кэш maskImages:", maskImages);
        console.log("Итоговый список путей loadedMaskPaths:", loadedMaskPaths);
    }

    // --- Установка текущей маски (адаптирована под 'generic' тип) ---
    function setCurrentMask(type, fullPath) {
        // Проверяем валидность изображения в кэше
        if (maskImages[fullPath] && maskImages[fullPath].complete && maskImages[fullPath].naturalHeight > 0) {
            currentMaskType = type; // 'generic' или 'none'
            currentMaskFullPath = fullPath;
            currentMaskImage = maskImages[fullPath];
            console.log(`Маска установлена: Тип=${type}, Файл=${fullPath.split('/').pop()}`);
        } else {
            // Если не удалось установить запрошенную, ставим 'none'
            const nonePath = './masks/none.png';
            console.warn(`Не удалось установить маску: ${fullPath}. Установка 'none'.`);
            currentMaskType = 'none';
            currentMaskFullPath = nonePath;
            if (maskImages[nonePath] && maskImages[nonePath].complete && maskImages[nonePath].naturalHeight > 0) {
                 currentMaskImage = maskImages[nonePath];
                 console.log("Установлена маска 'none'.");
            } else {
                 currentMaskImage = null;
                 console.error("Не удалось загрузить './masks/none.png'. Маска не будет отображаться.");
            }
        }
    }

    // --- Функция случайного выбора маски (использует loadedMaskPaths) ---
    function changeMaskRandomly() {
        console.log("--- Попытка смены маски по кнопке ---");

        // Собираем ВСЕ доступные валидные опции: загруженные maskN.png + none.png (если загружен)
        const availableOptions = [...loadedMaskPaths]; // Копируем массив загруженных maskN.png
        const nonePath = './masks/none.png';
        if (maskImages[nonePath] && maskImages[nonePath].complete && maskImages[nonePath].naturalHeight > 0) {
            availableOptions.push(nonePath); // Добавляем none.png
        }

        console.log(`Всего доступных опций для выбора (включая none): ${availableOptions.length}`);
        console.log('Опции:', availableOptions);

        if (availableOptions.length === 0) {
            console.error("Нет доступных масок для выбора!");
            alert("Нет доступных масок для смены.");
            return; // Нечего выбирать
        }

        let selectableOptions = availableOptions;
        // Стараемся не повторять текущую маску, если есть другие варианты
        if (availableOptions.length > 1 && currentMaskFullPath) {
            selectableOptions = availableOptions.filter(path => path !== currentMaskFullPath);
            if (selectableOptions.length === 0) { // Если осталась только текущая
                 console.log("Фильтр не оставил вариантов, выбираем из всех доступных.");
                 selectableOptions = availableOptions;
            }
        }

        // Выбираем случайный путь
        const randomIndex = Math.floor(Math.random() * selectableOptions.length);
        const chosenPath = selectableOptions[randomIndex];

        // Определяем тип: 'none' если путь к none.png, иначе 'generic'
        const chosenType = (chosenPath === nonePath) ? 'none' : 'generic';

        console.log(`Выбрана случайная опция: Тип=${chosenType}, Путь=${chosenPath}`);
        setCurrentMask(chosenType, chosenPath);
        console.log("--- Смена маски завершена ---");
    }


    // --- Основной цикл отрисовки (использует 'generic' тип) ---
    async function detectAndDraw() {
        if (!modelsLoaded || !videoReady || video.paused || video.ended || video.readyState < 3) {
            requestAnimationFrame(detectAndDraw); return;
        }

        const detectionOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 320 });
        let detection = null;
        try {
            detection = await faceapi.detectSingleFace(video, detectionOptions).withFaceLandmarks(true);
        } catch (detectionError) {
            console.error("Ошибка при обнаружении лица:", detectionError);
            requestAnimationFrame(detectAndDraw); return;
        }

        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Рисуем маску, если она НЕ 'none' и изображение есть
        if (detection && currentMaskType === 'generic' && currentMaskImage) {
            const landmarks = detection.landmarks;
             // Используем конфиг для 'generic' типа
            const typeConfig = MASK_TYPE_CONFIG['generic'];

            if (!typeConfig) { // На всякий случай
                console.error("Конфигурация для 'generic' типа маски не найдена!");
                requestAnimationFrame(detectAndDraw); return;
            }

            let x, y, width, height;
            try {
                // Используем логику позиционирования как у корон (выше бровей)
                const leftEyeBrow = landmarks.getLeftEyeBrow();
                const rightEyeBrow = landmarks.getRightEyeBrow();
                const browWidth = (rightEyeBrow[4].x - leftEyeBrow[0].x);
                width = browWidth * typeConfig.scale; // Масштаб из конфига
                if (currentMaskImage.naturalWidth === 0) throw new Error("Mask image width is zero.");
                height = width * (currentMaskImage.naturalHeight / currentMaskImage.naturalWidth); // Пропорциональная высота

                const browCenterX = (leftEyeBrow[0].x + rightEyeBrow[4].x) / 2;
                x = browCenterX - width / 2; // Центрируем по X над бровями
                const browMidTopY = (leftEyeBrow[2].y + rightEyeBrow[2].y) / 2;
                // offsetY определяет смещение ЦЕНТРА маски относительно линии бровей
                const targetCenterY = browMidTopY + (height * typeConfig.offsetY); // offsetY < 0 смещает вверх
                y = targetCenterY - (height / 2); // Координата верхнего края

                // Рисуем
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


    // --- Добавление обработчиков событий ---
    if (changeMaskButton) {
        changeMaskButton.addEventListener('click', changeMaskRandomly);
    } else { console.error("Не удалось найти кнопку 'СМЕНИТЬ'."); }

    if (screenshotButton) {
        screenshotButton.addEventListener('click', takeScreenshot);
    } else { console.error("Не удалось найти кнопку 'СКРИНШОТ'."); }

    // --- Инициализация приложения ---
    console.log("Запуск инициализации приложения...");
    preloadMaskImages(); // Запускаем НОВУЮ асинхронную загрузку масок
                         // Она будет работать в фоне и заполнять maskImages и loadedMaskPaths
    loadModels();        // Параллельно грузим модели
    startVideo();        // Параллельно запрашиваем камеру
                         // checkReadyAndStart запустит отрисовку, когда модели и видео будут готовы

}); // Конец DOMContentLoaded
