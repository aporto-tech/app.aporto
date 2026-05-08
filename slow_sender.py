import asyncio
import httpx
import json
import time
import sys
import traceback

# --- НАСТРОЙКИ ---
API_KEY = "sk-bUr97UeVE5g2TS6AGoyr7HCid3CTP0YlGEYAHpU6m7Azu02p"  # <-- ВСТАВЬ СВОЙ КЛЮЧ ЗДЕСЬ
URL = "https://api.aporto.tech/v1/chat/completions"
MODEL = "anthropic/claude-4.6-sonnet"
TOTAL_DURATION = 3550    # Общее время (почти 1 час)
MAX_TOKENS = 1000        # Ограничение на ответ модели
CHUNK_SIZE = 2           # Минимальный размер чанка для частого "пульса"

async def chunked_payload_generator(task_text):
    """
    Генератор, который дробит JSON на микро-части и отправляет их крайне медленно.
    """
    payload_dict = {
        "model": MODEL,
        "messages": [{"role": "user", "content": task_text}],
        "stream": True,
        "max_tokens": MAX_TOKENS
    }
    
    try:
        full_json = json.dumps(payload_dict)
        total_chars = len(full_json)
        
        # Разбиваем на микро-чанки по 2 символа
        chunks = [full_json[i:i + CHUNK_SIZE] for i in range(0, total_chars, CHUNK_SIZE)]
        num_chunks = len(chunks)
        
        # Рассчитываем паузу (интервал), чтобы растянуть процесс на час
        delay_per_chunk = TOTAL_DURATION / num_chunks
        
        print(f"\n--- МАРАФОН: РЕЖИМ ПУЛЬСАЦИИ ---")
        print(f"Всего символов: {total_chars}")
        print(f"Количество порций: {num_chunks}")
        print(f"Интервал отправки: {delay_per_chunk:.2f} сек.")
        print("-" * 45)

        start_time = time.time()
        for i, chunk in enumerate(chunks):
            # Отправляем микро-порцию данных
            yield chunk.encode('utf-8')
            
            # Обновляем прогресс в терминале
            if i % 5 == 0 or i == num_chunks - 1:
                elapsed = time.time() - start_time
                percent = ((i + 1) / num_chunks) * 100
                sys.stdout.write(f"\r[ПЕРЕДАЧА] {percent:.1f}% | Прошло: {elapsed:.0f}с | Чанк: {i+1}/{num_chunks}")
                sys.stdout.flush()

            # Ждем перед следующим чанком
            if i < num_chunks - 1:
                await asyncio.sleep(delay_per_chunk)
        
        print(f"\n--- [100%] Все байты переданы. Ожидаем реакцию Sonnet 4.6... ---")
    except Exception as e:
        print(f"\n[!] Ошибка в генераторе данных: {e}")

async def run_long_request():
    if API_KEY == "ВАШ_API_KEY":
        print("[!] ОШИБКА: Замени 'ВАШ_API_KEY' на настоящий ключ!")
        return

    # Раздуваем задание, чтобы символов было достаточно для стабильного ритма
    base_instruction = "Напиши подробный аналитический прогноз развития AI-агентов до 2030 года."
    # Добавляем "вес" через контекст (примерно 4000-5000 символов)
    padding = "Контекстная_информация_для_поддержания_стабильности_канала_связи_Aporto_2026_ " * 60
    my_task = f"{base_instruction}\n\n{padding}"

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "Transfer-Encoding": "chunked" # Ключевой заголовок для потоковой отправки
    }

    # Отключаем все таймауты (timeout=None)
    # connect=60.0 дает время на само установление связи
    timeout = httpx.Timeout(None, connect=60.0)
    
    print(f"Подключение к {URL}...")
    
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            # Инициируем POST-запрос с генератором контента
            async with client.stream("POST", URL, headers=headers, content=chunked_payload_generator(my_task)) as response:
                
                print(f"Статус сервера: {response.status_code} {response.reason_phrase}")
                
                if response.status_code != 200:
                    print(f"[!] Сервер отклонил запрос.")
                    error_data = await response.aread()
                    print(f"Ответ сервера: {error_data.decode('utf-8', errors='ignore')}")
                    return

                print("--- ПРИЕМ ОТВЕТА ОТ МОДЕЛИ ---")
                async for line in response.aiter_lines():
                    if line.strip():
                        if line.startswith("data: "):
                            content = line[6:]
                            if content.strip() == "[DONE]":
                                print("\n--- СЕАНС ЗАВЕРШЕН ---")
                                break
                            try:
                                data = json.loads(content)
                                token = data['choices'][0]['delta'].get('content', '')
                                print(token, end='', flush=True)
                            except:
                                continue

        except httpx.ReadError:
            print("\n[!] Ошибка чтения: Сервер все-таки закрыл соединение. Возможно, сработал общий таймаут на тело запроса.")
        except Exception as e:
            print(f"\n[!] Ошибка выполнения:")
            traceback.print_exc()

if __name__ == "__main__":
    try:
        asyncio.run(run_long_request())
    except KeyboardInterrupt:
        print("\n\n[!] Прервано пользователем.")
    except Exception:
        traceback.print_exc()