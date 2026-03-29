import asyncio
import websockets
import ssl
import warnings

async def test_connection(uri):
    """尝试连接到指定的 WebSocket URI"""
    print(f"--- 正在尝试连接到: {uri} ---")
    
    try:
        # 使用最简单的连接方式，并设置一个合理的超时
        async with websockets.connect(uri, open_timeout=10) as websocket:
            
            print(f"✅✅✅ 连接成功！ URI: {uri} ✅✅✅")
            
            # 尝试接收一条消息
            try:
                message = await asyncio.wait_for(websocket.recv(), timeout=5)
                print(f"📦 收到服务器消息: {message}")
            except asyncio.TimeoutError:
                print("ℹ️ 5秒内未收到服务器的主动消息。")
            
    except websockets.InvalidStatusCode as e:
        print(f"❌ 连接失败 (HTTP 状态码错误): {e.status_code}")
        print(f"   服务器在 {uri} 拒绝了 WebSocket 握手。这很可能就是错误的路径。")
    except asyncio.TimeoutError:
        print(f"❌ 连接失败 (超时): {uri} 上的服务没有在10秒内响应。")
        print(f"   请检查 Render 服务是否已“唤醒”。")
    except Exception as e:
        print(f"❌ 连接失败 (发生未知错误): {e}")
        print(f"   请检查 {uri} 是否正确，以及 Render 服务日志。")

async def main():
    # 1. 尝试根路径 (您 Applet 正在尝试的)
    uri_root = "wss://gemini-reply.onrender.com/"
    await test_connection(uri_root)
    
    print("\n" + "="*30 + "\n")
    
    # 2. 尝试 /ws 路径 (我根据 Nginx 截图推测的)
    uri_ws = "wss://gemini-reply.onrender.com/ws"
    await test_connection(uri_ws)

if __name__ == "__main__":
    # 忽略库的弃用警告
    warnings.filterwarnings("ignore", category=DeprecationWarning)
    asyncio.run(main())