import pandas as pd 
import pybaseball as pyb
from pitcher_trend_analyzer import get_mlbam_id
import unittest

class TestMLBID(unittest.TestCase):
    def test_get_mlbam_id(self):
        self.assertEqual(get_mlbam_id("Jacob deGrom"), 594798)
        self.assertEqual(get_mlbam_id("Mike Trout"), 545361)
        self.assertEqual(get_mlbam_id("Mookie Betts"), 605141)
        self.assertEqual(get_mlbam_id("Shohei Ohtani"), 660271)
        self.assertEqual(get_mlbam_id("Fernando Tatis Jr."), 665487)
        self.assertEqual(get_mlbam_id("Juan Soto"), 670801)
        self.assertEqual(get_mlbam_id("Vladimir Guerrero Jr."), 667055)
        self.assertEqual(get_mlbam_id("Gerrit Cole"), 605193)
        self.assertEqual(get_mlbam_id("Max Scherzer"), 453286)
        self.assertEqual(get_mlbam_id("Clayton Kershaw"), 477132)

if __name__ == '__main__':    
    unittest.main()