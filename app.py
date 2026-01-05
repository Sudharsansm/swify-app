import os
from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import datetime
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)

# Vercel handling: SQLite must be in /tmp for write access in serverless functions
if os.environ.get('VERCEL'):
    db_path = '/tmp/todo_v3.db'
    upload_folder = '/tmp/uploads'
else:
    db_path = os.path.join(os.path.abspath(os.path.dirname(__file__)), 'todo_v3.db')
    upload_folder = 'static/uploads'

app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = upload_folder
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload

# Ensure upload directory exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

db = SQLAlchemy(app)

class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=True)
    category = db.Column(db.String(20), default='Personal')
    priority = db.Column(db.String(10), default='Medium') # Low, Medium, High
    completed = db.Column(db.Boolean, default=False)
    due_date = db.Column(db.DateTime, nullable=True)
    focus_duration = db.Column(db.Integer, default=25)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # New Keep-like features
    color = db.Column(db.String(20), default='default')
    is_pinned = db.Column(db.Boolean, default=False)
    tags = db.Column(db.String(200), nullable=True)
    user_id = db.Column(db.String(50), nullable=True) # For multi-user isolation
    # Relationships
    subtasks = db.relationship('Subtask', backref='task', lazy=True, cascade="all, delete-orphan")
    attachments = db.relationship('Attachment', backref='task', lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'category': self.category,
            'priority': self.priority,
            'completed': self.completed,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'focus_duration': self.focus_duration,
            'created_at': self.created_at.isoformat(),
            'color': self.color,
            'is_pinned': self.is_pinned,
            'tags': self.tags,
            'subtasks': [s.to_dict() for s in self.subtasks],
            'attachments': [a.to_dict() for a in self.attachments]
        }

class Attachment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    file_path = db.Column(db.String(200), nullable=False)
    file_type = db.Column(db.String(50), nullable=True) # image, video, audio, etc.
    task_id = db.Column(db.Integer, db.ForeignKey('task.id'), nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'file_path': self.file_path,
            'file_type': self.file_type,
            'task_id': self.task_id
        }

class Subtask(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    text = db.Column(db.String(100), nullable=False)
    completed = db.Column(db.Boolean, default=False)
    task_id = db.Column(db.Integer, db.ForeignKey('task.id'), nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'text': self.text,
            'completed': self.completed,
            'task_id': self.task_id
        }

with app.app_context():
    db.create_all()

@app.route('/migrate')
def migrate():
    try:
        from sqlalchemy import text
        with db.engine.connect() as conn:
            try:
                conn.execute(text("ALTER TABLE task ADD COLUMN tags VARCHAR(200)"))
            except: pass
            try:
                conn.execute(text("ALTER TABLE task ADD COLUMN user_id VARCHAR(50)"))
            except: pass
            conn.commit()
        return "Migration successful: Columns added."
    except Exception as e:
        return f"Migration info: {str(e)}"

@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    user_id = request.headers.get('X-User-ID', 'default')
    category_filter = request.args.get('category')
    search_query = request.args.get('q')
    
    query = Task.query.filter_by(user_id=user_id)
    
    if category_filter and category_filter != 'all':
        query = query.filter_by(category=category_filter)
    
    if search_query:
        query = query.filter(
            Task.title.contains(search_query) | 
            Task.description.contains(search_query) |
            Task.tags.contains(search_query)
        )
        
    # Sort by Pinned first, then Completion status, then Priority, then Date
    tasks = query.order_by(
        Task.is_pinned.desc(),
        Task.completed, 
        db.case(
            (Task.priority == 'High', 1),
            (Task.priority == 'Medium', 2),
            (Task.priority == 'Low', 3),
            else_=4
        ),
        Task.due_date, 
        Task.created_at.desc()
    ).all()
    
    counts = {
        'all': Task.query.count(),
        'Personal': Task.query.filter_by(category='Personal').count(),
        'Work': Task.query.filter_by(category='Work').count(),
        'todo': Task.query.filter_by(category='TO-DO').count()
    }
    
    return jsonify({
        'tasks': [task.to_dict() for task in tasks],
        'counts': counts
    })

@app.route('/api/tasks', methods=['POST'])
def add_task():
    user_id = request.headers.get('X-User-ID', 'default')
    # Handle Form Data (including files)
    title = request.form.get('title')
    due_date_str = request.form.get('due_date')
    category = request.form.get('category', 'Personal')
    priority = request.form.get('priority', 'Medium')
    description = request.form.get('description')
    focus_time = request.form.get('focus_duration', type=int) or 25
    color = request.form.get('color', 'default')
    tags = request.form.get('tags', '')
    
    due_date = None
    if due_date_str:
        try:
            if 'T' in due_date_str:
                due_date = datetime.strptime(due_date_str, '%Y-%m-%dT%H:%M')
            else:
                due_date = datetime.strptime(due_date_str, '%Y-%m-%d')
        except ValueError:
            due_date = None

    new_task = Task(
        title=title, 
        due_date=due_date, 
        category=category, 
        priority=priority, 
        description=description, 
        focus_duration=focus_time,
        color=color,
        tags=tags,
        user_id=user_id
    )
    db.session.add(new_task)
    db.session.flush() # Get task ID

    if 'attachment' in request.files:
        files = request.files.getlist('attachment')
        for file in files:
            if file and file.filename != '':
                filename = secure_filename(file.filename)
                filename = f"{datetime.now().timestamp()}_{filename}"
                file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
                attachment_path = f"uploads/{filename}"
                
                # Determine file type
                file_type = 'file'
                ext = filename.split('.')[-1].lower()
                if ext in ['jpg', 'jpeg', 'png', 'gif', 'webp']: file_type = 'image'
                elif ext in ['mp4', 'webm', 'ogg', 'mov']: file_type = 'video'
                elif ext in ['mp3', 'wav', 'mpeg', 'm4a']: file_type = 'audio'
                
                new_attachment = Attachment(file_path=attachment_path, file_type=file_type, task_id=new_task.id)
                db.session.add(new_attachment)
    db.session.commit()
    return jsonify(new_task.to_dict()), 201

@app.route('/api/tasks/<int:id>', methods=['PUT', 'DELETE'])
def update_delete_task(id):
    user_id = request.headers.get('X-User-ID', 'default')
    task = Task.query.filter_by(id=id, user_id=user_id).first_or_404()
    
    if request.method == 'DELETE':
        db.session.delete(task)
        db.session.commit()
        return jsonify({'success': True})
    
    # Update Fields
    if 'title' in request.form: task.title = request.form.get('title')
    if 'description' in request.form: task.description = request.form.get('description')
    if 'category' in request.form: task.category = request.form.get('category')
    if 'priority' in request.form: task.priority = request.form.get('priority')
    if 'tags' in request.form: task.tags = request.form.get('tags')
    if 'color' in request.form: task.color = request.form.get('color')
    if 'focus_duration' in request.form: task.focus_duration = request.form.get('focus_duration', type=int)
    
    if 'attachment' in request.files:
        files = request.files.getlist('attachment')
        for file in files:
            if file and file.filename != '':
                filename = secure_filename(file.filename)
                filename = f"{datetime.now().timestamp()}_{filename}"
                file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
                attachment_path = f"uploads/{filename}"
                
                file_type = 'file'
                ext = filename.split('.')[-1].lower()
                if ext in ['jpg', 'jpeg', 'png', 'gif', 'webp']: file_type = 'image'
                elif ext in ['mp4', 'webm', 'ogg', 'mov']: file_type = 'video'
                elif ext in ['mp3', 'wav', 'mpeg', 'm4a']: file_type = 'audio'
                
                new_attachment = Attachment(file_path=attachment_path, file_type=file_type, task_id=task.id)
                db.session.add(new_attachment)

    if 'due_date' in request.form:
        due_date_str = request.form.get('due_date')
        if due_date_str:
             try:
                if 'T' in due_date_str:
                    task.due_date = datetime.strptime(due_date_str, '%Y-%m-%dT%H:%M')
                else:
                    task.due_date = datetime.strptime(due_date_str, '%Y-%m-%d')
             except ValueError:
                task.due_date = None 
        else:
             task.due_date = None

    # Subtask Editing Logic
    for key in request.form:
        if key.startswith('subtask_content_'):
            try:
                sid = int(key.split('_')[2])
                content = request.form[key]
                sub = Subtask.query.get(sid)
                if sub and sub.task_id == task.id:
                     sub.text = content
            except (ValueError, IndexError):
                pass
    
    deleted_ids = request.form.get('deleted_subtasks')
    if deleted_ids:
        for did in deleted_ids.split(','):
            if did:
                try:
                    sub = Subtask.query.get(int(did))
                    if sub and sub.task_id == task.id:
                        db.session.delete(sub)
                except ValueError:
                    pass

    deleted_attachment_ids = request.form.get('deleted_attachments')
    if deleted_attachment_ids:
        for aid in deleted_attachment_ids.split(','):
            if aid:
                try:
                    attach = Attachment.query.get(int(aid))
                    if attach and attach.task_id == task.id:
                        db.session.delete(attach)
                except ValueError:
                    pass

    db.session.commit()
    return jsonify(task.to_dict())

@app.route('/api/tasks/<int:id>/toggle-pin', methods=['POST'])
def toggle_pin(id):
    user_id = request.headers.get('X-User-ID', 'default')
    task = Task.query.filter_by(id=id, user_id=user_id).first_or_404()
    task.is_pinned = not task.is_pinned
    db.session.commit()
    return jsonify(task.to_dict())

@app.route('/api/tasks/<int:id>/complete', methods=['POST'])
def complete_task(id):
    user_id = request.headers.get('X-User-ID', 'default')
    task = Task.query.filter_by(id=id, user_id=user_id).first_or_404()
    task.completed = not task.completed
    db.session.commit()
    return jsonify(task.to_dict())

@app.route('/api/tasks/<int:task_id>/subtasks', methods=['POST'])
def add_subtask(task_id):
    user_id = request.headers.get('X-User-ID', 'default')
    task = Task.query.filter_by(id=task_id, user_id=user_id).first_or_404()
    data = request.json or request.form
    text = data.get('text')
    if text:
        subtask = Subtask(text=text, task_id=task.id)
        db.session.add(subtask)
        db.session.commit()
        return jsonify(subtask.to_dict())
    return jsonify({'error': 'No text provided'}), 400

@app.route('/api/subtasks/<int:id>/toggle', methods=['POST'])
def toggle_subtask(id):
    user_id = request.headers.get('X-User-ID', 'default')
    subtask = Subtask.query.get_or_404(id)
    if subtask.task.user_id != user_id:
        return jsonify({'error': 'Unauthorized'}), 403
    subtask.completed = not subtask.completed
    db.session.commit()
    return jsonify(subtask.to_dict())

@app.route('/api/subtasks/<int:id>', methods=['DELETE'])
def delete_subtask(id):
    user_id = request.headers.get('X-User-ID', 'default')
    subtask = Subtask.query.get_or_404(id)
    if subtask.task.user_id != user_id:
        return jsonify({'error': 'Unauthorized'}), 403
    db.session.delete(subtask)
    db.session.commit()
    return jsonify({'success': True})

if __name__ == "__main__":
    app.run(debug=True, port=5000)
