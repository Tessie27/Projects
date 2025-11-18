from flask import Flask, render_template, request, jsonify, g
import sqlite3
import requests
import os
from datetime import datetime
from contextlib import closing

app = Flask(__name__)
app.config['DATABASE'] = 'tasks.db'
app.config['SECRET_KEY'] = os.urandom(24)

def init_db():
    """Initialize the database with required tables"""
    db = sqlite3.connect(app.config['DATABASE'])
    db.row_factory = sqlite3.Row
    try:
        db.execute('''
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                due_date DATE,
                description TEXT,
                completed BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                priority INTEGER DEFAULT 2
            )
        ''')
        db.commit()
        print("Database initialized successfully")
    except Exception as e:
        print(f"Error initializing database: {e}")
    finally:
        db.close()

def get_db():
    """Get database connection with initialization"""
    if not hasattr(g, 'db'):
        # Create database if it doesn't exist
        if not os.path.exists(app.config['DATABASE']):
            init_db()
        
        g.db = sqlite3.connect(app.config['DATABASE'])
        g.db.row_factory = sqlite3.Row
    
    return g.db

@app.teardown_appcontext
def close_db(error):
    """Close database connection at the end of request"""
    if hasattr(g, 'db'):
        g.db.close()

@app.route("/")
def index():
    try:
        db = get_db()
        tasks = db.execute('''
            SELECT * FROM tasks 
            ORDER BY 
                completed ASC,
                priority DESC,
                due_date IS NULL,
                due_date ASC,
                created_at DESC
        ''').fetchall()
        
        # Get current date for template
        current_date = datetime.now().strftime('%Y-%m-%d')
        return render_template("index.html", tasks=tasks, current_date=current_date)
    
    except Exception as e:
        print(f"Error in index route: {e}")
        return render_template("index.html", tasks=[], current_date=datetime.now().strftime('%Y-%m-%d'))

@app.route("/add", methods=["POST"])
def add_task():
    try:
        data = request.get_json()
        if not data or 'task' not in data:
            return jsonify({"error": "Task name is required"}), 400
        
        task = data['task'].strip()
        due_date = data.get('due_date', '')
        description = data.get('description', '').strip()
        priority = data.get('priority', 2)
        
        if not task:
            return jsonify({"error": "Task name cannot be empty"}), 400
        
        # Validate priority
        if priority not in [1, 2, 3]:
            priority = 2
        
        db = get_db()
        cursor = db.cursor()
        cursor.execute(
            "INSERT INTO tasks (name, due_date, description, priority) VALUES (?, ?, ?, ?)",
            (task, due_date, description, priority)
        )
        db.commit()
        task_id = cursor.lastrowid
        
        # Return the complete task data
        new_task = db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        
        return jsonify({
            "id": new_task['id'],
            "name": new_task['name'],
            "due_date": new_task['due_date'],
            "description": new_task['description'],
            "completed": bool(new_task['completed']),
            "priority": new_task['priority'],
            "created_at": new_task['created_at']
        })
    
    except Exception as e:
        print(f"Error adding task: {e}")
        return jsonify({"error": "Internal server error"}), 500

@app.route("/update/<int:task_id>", methods=["PUT"])
def update_task(task_id):
    try:
        data = request.get_json()
        db = get_db()
        
        # Check if task exists
        task = db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not task:
            return jsonify({"error": "Task not found"}), 404
        
        # Build update query dynamically based on provided fields
        update_fields = []
        params = []
        
        if 'completed' in data:
            update_fields.append("completed = ?")
            params.append(1 if data['completed'] else 0)
        
        if 'name' in data and data['name'].strip():
            update_fields.append("name = ?")
            params.append(data['name'].strip())
        
        if 'due_date' in data:
            update_fields.append("due_date = ?")
            params.append(data['due_date'])
        
        if 'description' in data:
            update_fields.append("description = ?")
            params.append(data['description'].strip())
        
        if 'priority' in data:
            update_fields.append("priority = ?")
            params.append(data['priority'])
        
        if not update_fields:
            return jsonify({"error": "No fields to update"}), 400
        
        params.append(task_id)
        query = f"UPDATE tasks SET {', '.join(update_fields)} WHERE id = ?"
        
        db.execute(query, params)
        db.commit()
        
        # Return updated task
        updated_task = db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        return jsonify({
            "id": updated_task['id'],
            "name": updated_task['name'],
            "due_date": updated_task['due_date'],
            "description": updated_task['description'],
            "completed": bool(updated_task['completed']),
            "priority": updated_task['priority'],
            "created_at": updated_task['created_at']
        })
    
    except Exception as e:
        print(f"Error updating task: {e}")
        return jsonify({"error": "Internal server error"}), 500

@app.route("/remove/<int:task_id>", methods=["DELETE"])
def remove_task(task_id):
    try:
        db = get_db()
        result = db.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        db.commit()
        
        if result.rowcount == 0:
            return jsonify({"error": "Task not found"}), 404
        
        return jsonify({"message": "Task removed successfully"})
    
    except Exception as e:
        print(f"Error removing task: {e}")
        return jsonify({"error": "Internal server error"}), 500

@app.route("/weather")
def get_weather():
    try:
        city = request.args.get("city", "Johannesburg").strip()
        if not city:
            return jsonify({"error": "City name is required"}), 400
        
        # Use environment variable for API key in production
        api_key = os.getenv('WEATHER_API_KEY', 'ccb110164bcc121f563f7ff988406209')
        
        params = {
            "q": city,
            "appid": api_key,
            "units": "metric",
        }
        
        response = requests.get("https://api.openweathermap.org/data/2.5/weather", 
                              params=params, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            return jsonify({
                "city": data["name"],
                "temperature": round(data["main"]["temp"], 1),
                "description": data["weather"][0]["description"].title(),
                "humidity": data["main"]["humidity"],
                "wind_speed": data["wind"]["speed"],
                "icon": data["weather"][0]["icon"]
            })
        else:
            return jsonify({"error": "City not found"}), 404
            
    except requests.exceptions.Timeout:
        return jsonify({"error": "Weather service timeout"}), 408
    except Exception as e:
        print(f"Weather error: {e}")
        return jsonify({"error": "Could not fetch weather data"}), 500

@app.route("/stats")
def get_stats():
    try:
        db = get_db()
        stats = db.execute('''
            SELECT 
                COUNT(*) as total,
                SUM(completed) as completed,
                COUNT(*) - SUM(completed) as pending,
                SUM(CASE WHEN due_date < date('now') AND completed = 0 THEN 1 ELSE 0 END) as overdue
            FROM tasks
        ''').fetchone()
        
        return jsonify({
            "total": stats['total'] or 0,
            "completed": stats['completed'] or 0,
            "pending": stats['pending'] or 0,
            "overdue": stats['overdue'] or 0
        })
    
    except Exception as e:
        print(f"Error getting stats: {e}")
        return jsonify({"error": "Internal server error"}), 500

# Initialize database when the app starts
with app.app_context():
    init_db()

if __name__ == "__main__":
    print("Starting Flask application...")
    app.run(debug=True, host='0.0.0.0', port=5000)