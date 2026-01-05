from PIL import Image, ImageDraw

def create_icon(size):
    img = Image.new('RGB', (size, size), color='#1e1b4b')
    d = ImageDraw.Draw(img)
    # Draw simple checkmark or text
    d.text((size//4, size//2), "TM", fill="white")
    # Alternatively draw a circle
    d.ellipse([size//4, size//4, size*3//4, size*3//4], outline="white", width=5)
    img.save(f'static/icons/icon-{size}x{size}.png')

if __name__ == "__main__":
    create_icon(192)
    create_icon(512)
