"""
Script to run the app on your local network
This allows other devices on your WiFi to access the app
Perfect for testing on phones or sharing with friends
"""
import os
import socket
import uvicorn
from main import app

def get_local_ip():
    """Get the local IP address of this machine"""
    try:
        # Create a socket connection to find local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))  # Connect to Google DNS
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"

def print_banner(ip, port):
    """Print a nice banner with connection information"""
    banner = f"""
╔══════════════════════════════════════════════════════╗
║         🎥 Webcam Caption App - Network Mode 🎥     ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  📍 Local access:                                    ║
║     http://localhost:{port}                          ║ 
║                                                      ║
║  📱 Network access (use on phone/other devices):     ║
║     http://{ip}:{port}                               ║
║                                                      ║
║  📖 API Documentation:                               ║
║     http://{ip}:{port}/docs                           ║
║                                                      ║
╠══════════════════════════════════════════════════════╣
║  ⚠️  Make sure:                                      ║
║  • Windows Firewall allows Python                    ║
║  • All devices are on the same WiFi network          ║
║  • Port {port} is not blocked                        ║
║                                                      ║
║  🛑 Press Ctrl+C to stop the server                  ║
╚══════════════════════════════════════════════════════╝
"""
    print(banner)

if __name__ == "__main__":
    local_ip = get_local_ip()
    port = 8000
    
    # Print connection information
    print_banner(local_ip, port)
    
    # Instructions for Windows Firewall
    print("\n💡 First time? Windows may ask to allow Python through firewall.")
    print("   Click 'Allow access' when prompted.\n")
    
    # Run the server
    uvicorn.run(
        app,
        host="0.0.0.0",  # Listen on all network interfaces
        port=port,
        log_level="info",
        reload=False  # Disable reload for network mode
    )